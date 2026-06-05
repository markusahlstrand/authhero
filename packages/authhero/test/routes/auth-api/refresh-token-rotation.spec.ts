import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import {
  formatRefreshToken,
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
  parseRefreshToken,
  REFRESH_TOKEN_PREFIX,
} from "../../../src/utils/refresh-token-format";
import { ulid } from "../../../src/utils/ulid";

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
}

interface ErrorResponse {
  error: string;
  error_description?: string;
}

const idleHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

const baseTokenFields = {
  login_id: "loginSessionId",
  user_id: "email|userId",
  client_id: "clientId",
  resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
  device: {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  },
};

async function seedNewFormatToken(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  overrides: {
    rotating?: boolean;
    family_id?: string;
    rotated_at?: string;
    rotated_to?: string;
    id?: string;
  } = {},
) {
  const id = overrides.id ?? ulid();
  const { lookup, secret } = generateRefreshTokenParts();
  const token_hash = await hashRefreshTokenSecret(secret);
  await env.data.refreshTokens.create("tenantId", {
    ...baseTokenFields,
    id,
    rotating: overrides.rotating ?? true,
    token_lookup: lookup,
    token_hash,
    family_id: overrides.family_id ?? id,
    rotated_at: overrides.rotated_at,
    rotated_to: overrides.rotated_to,
    expires_at: idleHour(),
    idle_expires_at: idleHour(),
  });
  return { id, lookup, secret, wire: formatRefreshToken(lookup, secret) };
}

async function setRotating(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  rotation_type: "rotating" | "non-rotating",
  leeway?: number,
) {
  await env.data.clients.update("tenantId", "clientId", {
    refresh_token: { rotation_type, ...(leeway !== undefined && { leeway }) },
  });
}

describe("refresh token rotation", () => {
  it("issues a rotated refresh token in the new format on exchange", async () => {
    const { oauthApp, env } = await getTestServer();
    await setRotating(env, "rotating");
    const seeded = await seedNewFormatToken(env, { rotating: true });
    const client = testClient(oauthApp, env);

    const response = await client.oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: seeded.wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as TokenResponse;
    expect(body.refresh_token).toBeTypeOf("string");
    expect(body.refresh_token).not.toBe(seeded.wire);
    expect(body.refresh_token!.startsWith(REFRESH_TOKEN_PREFIX)).toBe(true);

    // Parent row is marked rotated; child row exists in the same family.
    const parent = await env.data.refreshTokens.get("tenantId", seeded.id);
    expect(parent?.rotated_at).toBeTypeOf("string");
    expect(parent?.rotated_to).toBeTypeOf("string");

    const childParsed = parseRefreshToken(body.refresh_token!);
    if (childParsed.kind !== "new") {
      throw new Error("expected new-format wire token");
    }
    const child = await env.data.refreshTokens.getByLookup(
      "tenantId",
      childParsed.lookup,
    );
    expect(child).toBeTruthy();
    expect(child!.family_id).toBe(seeded.id);
    expect(child!.rotating).toBe(true);
  });

  it("does not store the secret at rest (only the SHA-256 hash)", async () => {
    const { env } = await getTestServer();
    const seeded = await seedNewFormatToken(env, { rotating: true });
    const row = await env.data.refreshTokens.get("tenantId", seeded.id);
    expect(row).toBeTruthy();
    expect(row!.token_hash).not.toBe(seeded.secret);
    expect(row!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("revokes the entire family when an already-rotated parent is reused outside leeway", async () => {
    const { oauthApp, env } = await getTestServer();
    await setRotating(env, "rotating", 1); // 1 second leeway
    const seeded = await seedNewFormatToken(env, { rotating: true });
    const client = testClient(oauthApp, env);

    // First rotation succeeds and produces a child.
    const firstRes = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: seeded.wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(firstRes.status).toBe(200);
    const firstBody = (await firstRes.json()) as TokenResponse;
    const childWire = firstBody.refresh_token!;

    // Sleep just past the 1-second leeway window so the next presentation
    // counts as reuse.
    await new Promise((r) => setTimeout(r, 1100));

    // Re-presenting the parent triggers reuse detection.
    const reuseRes = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: seeded.wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(reuseRes.status === 400 || reuseRes.status === 403).toBe(true);
    const err = (await reuseRes.json()) as ErrorResponse;
    expect(err.error).toBe("invalid_grant");

    // Both the parent and the new child are revoked (entire family torched).
    const parent = await env.data.refreshTokens.get("tenantId", seeded.id);
    expect(parent?.revoked_at).toBeTypeOf("string");

    const childParsed = parseRefreshToken(childWire);
    if (childParsed.kind !== "new") {
      throw new Error("expected new-format wire token");
    }
    const child = await env.data.refreshTokens.getByLookup(
      "tenantId",
      childParsed.lookup,
    );
    expect(child?.revoked_at).toBeTypeOf("string");
  });

  it("allows multiple rotations within the leeway window (concurrent-call tolerance)", async () => {
    const { oauthApp, env } = await getTestServer();
    await setRotating(env, "rotating", 60); // generous leeway
    const seeded = await seedNewFormatToken(env, { rotating: true });
    const client = testClient(oauthApp, env);

    const exchange = () =>
      client.oauth.token.$post(
        // @ts-expect-error
        {
          form: {
            grant_type: "refresh_token",
            refresh_token: seeded.wire,
            client_id: "clientId",
          },
        },
        { headers: { "tenant-id": "tenantId" } },
      );

    const r1 = await exchange();
    const r2 = await exchange();
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = (await r1.json()) as TokenResponse;
    const b2 = (await r2.json()) as TokenResponse;
    expect(b1.refresh_token).not.toBe(b2.refresh_token);

    // Both children share the parent's family_id.
    const c1 = parseRefreshToken(b1.refresh_token!);
    const c2 = parseRefreshToken(b2.refresh_token!);
    if (c1.kind !== "new" || c2.kind !== "new") {
      throw new Error("expected new-format wire tokens");
    }
    const child1 = await env.data.refreshTokens.getByLookup(
      "tenantId",
      c1.lookup,
    );
    const child2 = await env.data.refreshTokens.getByLookup(
      "tenantId",
      c2.lookup,
    );
    expect(child1?.family_id).toBe(seeded.id);
    expect(child2?.family_id).toBe(seeded.id);
  });

  it("non-rotating clients echo the same refresh token back", async () => {
    const { oauthApp, env } = await getTestServer();
    await setRotating(env, "non-rotating");
    const seeded = await seedNewFormatToken(env, { rotating: false });
    const client = testClient(oauthApp, env);

    const res = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: seeded.wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as TokenResponse;
    expect(body.refresh_token).toBe(seeded.wire);
  });

  it("rejects a wire token whose secret hash doesn't match the stored row", async () => {
    const { oauthApp, env } = await getTestServer();
    await setRotating(env, "rotating");
    const seeded = await seedNewFormatToken(env, { rotating: true });
    const client = testClient(oauthApp, env);

    // Replace the secret with a fresh random one but keep the lookup. The
    // row exists under that lookup, but the hash won't match.
    const tampered = formatRefreshToken(
      seeded.lookup,
      "definitely-not-the-original-secret",
    );

    const res = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: tampered,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(res.status === 400 || res.status === 403).toBe(true);
    const err = (await res.json()) as ErrorResponse;
    expect(err.error).toBe("invalid_grant");
  });

  it("legacy (id-only) refresh tokens still resolve before the cutoff", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.refreshTokens.create("tenantId", {
      ...baseTokenFields,
      id: "legacyRefreshToken",
      rotating: false,
      expires_at: idleHour(),
      idle_expires_at: idleHour(),
    });
    const client = testClient(oauthApp, env);

    const res = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: "legacyRefreshToken",
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(res.status).toBe(200);
  });

  it("non-rotating legacy rows upgrade in place to the new wire format on first refresh", async () => {
    const { oauthApp, env } = await getTestServer();
    // Seed a legacy row exactly as prod has them: rotating=false, no
    // token_lookup/token_hash, no family_id.
    await env.data.refreshTokens.create("tenantId", {
      ...baseTokenFields,
      id: "legacyUpgradeRow",
      rotating: false,
      expires_at: idleHour(),
      idle_expires_at: idleHour(),
    });
    const client = testClient(oauthApp, env);

    const first = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: "legacyUpgradeRow",
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as TokenResponse;

    // Client receives the new wire format, not the id they sent in.
    expect(firstBody.refresh_token).toBeDefined();
    expect(firstBody.refresh_token!.startsWith(REFRESH_TOKEN_PREFIX)).toBe(
      true,
    );
    expect(firstBody.refresh_token).not.toBe("legacyUpgradeRow");

    // Row is stamped with lookup/hash matching the issued wire token, and
    // family_id is anchored to the row id.
    const stored = await env.data.refreshTokens.get(
      "tenantId",
      "legacyUpgradeRow",
    );
    expect(stored?.token_lookup).toBeTruthy();
    expect(stored?.token_hash).toBeTruthy();
    expect(stored?.family_id).toBe("legacyUpgradeRow");
    const parsed = parseRefreshToken(firstBody.refresh_token!);
    expect(parsed.kind).toBe("new");
    if (parsed.kind === "new") {
      expect(parsed.lookup).toBe(stored?.token_lookup);
      expect(await hashRefreshTokenSecret(parsed.secret)).toBe(
        stored?.token_hash,
      );
    }

    // Subsequent refresh using the new wire token resolves through the
    // lookup path and continues to echo the same row (non-rotating).
    const second = await client.oauth.token.$post(
      // @ts-expect-error
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: firstBody.refresh_token!,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": "tenantId" } },
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as TokenResponse;
    expect(secondBody.refresh_token).toBe(firstBody.refresh_token);
  });

  it("admin DELETE on a single token revokes the entire family", async () => {
    const { managementApp, env } = await getTestServer();
    const seeded = await seedNewFormatToken(env, { rotating: true });

    // Create two children attached to the same family root.
    const child1Id = ulid();
    await env.data.refreshTokens.create("tenantId", {
      ...baseTokenFields,
      id: child1Id,
      rotating: true,
      family_id: seeded.id,
      expires_at: idleHour(),
      idle_expires_at: idleHour(),
    });

    const child2Id = ulid();
    await env.data.refreshTokens.create("tenantId", {
      ...baseTokenFields,
      id: child2Id,
      rotating: true,
      family_id: seeded.id,
      expires_at: idleHour(),
      idle_expires_at: idleHour(),
    });

    const adminToken = await getAdminToken();
    const res = await managementApp.request(
      `/refresh_tokens/${seeded.id}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${adminToken}`,
          "tenant-id": "tenantId",
        },
      },
      env,
    );
    expect(res.status).toBe(200);

    const c1 = await env.data.refreshTokens.get("tenantId", child1Id);
    const c2 = await env.data.refreshTokens.get("tenantId", child2Id);
    expect(c1?.revoked_at).toBeTypeOf("string");
    expect(c2?.revoked_at).toBeTypeOf("string");
  });
});
