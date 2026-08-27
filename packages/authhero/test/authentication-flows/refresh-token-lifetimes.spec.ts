import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { ulid } from "../../src/utils/ulid";
import { getTestServer } from "../helpers/test-server";
import {
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
  formatRefreshToken,
  parseRefreshToken,
} from "../../src/utils/refresh-token-format";
import { createRefreshToken } from "../../src/authentication-flows/common";
import { getEnrichedClient } from "../../src/helpers/client";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import type { Context } from "hono";
import type { Bindings, Variables } from "../../src/types";
import type { Client } from "@authhero/adapter-interfaces";

const TENANT = "tenantId";

const HOUR_MS = 60 * 60 * 1000;

function fakeCtx(env: Awaited<ReturnType<typeof getTestServer>>["env"]) {
  return {
    env,
    var: { tenant_id: TENANT, ip: "1.2.3.4", useragent: "vitest" },
    req: { header: () => undefined, query: () => undefined },
  } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
}

// Timestamps are minted with Date.now() inside the code under test, so
// assert against a window anchored on timestamps taken around the call.
function expectBetween(iso: string | undefined, fromMs: number, toMs: number) {
  expect(iso).toBeTypeOf("string");
  const actual = new Date(iso!).getTime();
  expect(actual).toBeGreaterThanOrEqual(fromMs);
  expect(actual).toBeLessThanOrEqual(toMs);
}

async function mintForClientConfig(
  env: Awaited<ReturnType<typeof getTestServer>>["env"],
  refreshTokenConfig: Client["refresh_token"],
) {
  await env.data.clients.update(TENANT, "clientId", {
    refresh_token: refreshTokenConfig,
  });
  const client = await getEnrichedClient(env, "clientId");
  const user = await getPrimaryUserByEmail({
    userAdapter: env.data.users,
    tenant_id: TENANT,
    email: "foo@example.com",
  });
  if (!client || !user) throw new Error("fixture missing");

  return createRefreshToken(fakeCtx(env), {
    user,
    client,
    login_id: "login-1",
    scope: "openid offline_access",
  });
}

describe("refresh token lifetimes at mint", () => {
  it("falls back to the tenant session lifetimes when the client config is unset", async () => {
    const { env } = await getTestServer();
    // Tenant lifetimes are hours.
    await env.data.tenants.update(TENANT, {
      session_lifetime: 24,
      idle_session_lifetime: 2,
    });

    const before = Date.now();
    const { row } = await mintForClientConfig(env, {});
    const after = Date.now();

    expectBetween(row.expires_at, before + 24 * HOUR_MS, after + 24 * HOUR_MS);
    expectBetween(
      row.idle_expires_at,
      before + 2 * HOUR_MS,
      after + 2 * HOUR_MS,
    );
  });

  it("prefers the per-client token_lifetime / idle_token_lifetime (seconds) over the tenant", async () => {
    const { env } = await getTestServer();
    await env.data.tenants.update(TENANT, {
      session_lifetime: 24,
      idle_session_lifetime: 2,
    });

    const before = Date.now();
    const { row } = await mintForClientConfig(env, {
      token_lifetime: 7200,
      idle_token_lifetime: 1800,
    });
    const after = Date.now();

    expectBetween(row.expires_at, before + 7200 * 1000, after + 7200 * 1000);
    expectBetween(
      row.idle_expires_at,
      before + 1800 * 1000,
      after + 1800 * 1000,
    );
  });

  it("mints without expiry when the infinite flags are set, even with tenant lifetimes configured", async () => {
    const { env } = await getTestServer();
    await env.data.tenants.update(TENANT, {
      session_lifetime: 24,
      idle_session_lifetime: 2,
    });

    const { row } = await mintForClientConfig(env, {
      infinite_token_lifetime: true,
      infinite_idle_token_lifetime: true,
    });

    expect(row.expires_at).toBeUndefined();
    expect(row.idle_expires_at).toBeUndefined();
  });

  it("respects expiration_type: non-expiring over any configured lifetimes", async () => {
    const { env } = await getTestServer();
    await env.data.tenants.update(TENANT, {
      session_lifetime: 24,
      idle_session_lifetime: 2,
    });

    const { row } = await mintForClientConfig(env, {
      expiration_type: "non-expiring",
      token_lifetime: 7200,
      idle_token_lifetime: 1800,
    });

    expect(row.expires_at).toBeUndefined();
    expect(row.idle_expires_at).toBeUndefined();
  });
});

describe("refresh token lifetimes on exchange", () => {
  const DEVICE = {
    last_ip: "",
    initial_ip: "",
    last_user_agent: "",
    initial_user_agent: "",
    initial_asn: "",
    last_asn: "",
  };

  async function seed(
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
    overrides: Record<string, unknown>,
  ) {
    const { lookup, secret } = generateRefreshTokenParts();
    const token_hash = await hashRefreshTokenSecret(secret);
    const id = ulid();
    await env.data.refreshTokens.create(TENANT, {
      id,
      login_id: "loginSessionId",
      user_id: "email|userId",
      client_id: "clientId",
      device: DEVICE,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      rotating: false,
      token_lookup: lookup,
      token_hash,
      family_id: id,
      expires_at: new Date(Date.now() + 24 * HOUR_MS).toISOString(),
      idle_expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
      ...overrides,
    });
    return { id, wire: formatRefreshToken(lookup, secret) };
  }

  async function exchange(
    oauthApp: Awaited<ReturnType<typeof getTestServer>>["oauthApp"],
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
    wire: string,
  ) {
    return testClient(oauthApp, env).oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": TENANT } },
    );
  }

  it("slides the rotated child's idle window by the client idle_token_lifetime", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update(TENANT, { idle_session_lifetime: 2 });
    await env.data.clients.update(TENANT, "clientId", {
      refresh_token: { rotation_type: "rotating", idle_token_lifetime: 1800 },
    });
    const seeded = await seed(env, { rotating: true });

    const before = Date.now();
    const res = await exchange(oauthApp, env, seeded.wire);
    const after = Date.now();
    expect(res.status).toBe(200);

    const body = (await res.json()) as { refresh_token?: string };
    const childParsed = parseRefreshToken(body.refresh_token!);
    if (childParsed.kind !== "new") {
      throw new Error("expected new-format wire token");
    }
    const child = await env.data.refreshTokens.getByLookup(
      TENANT,
      childParsed.lookup,
    );
    expectBetween(
      child!.idle_expires_at,
      before + 1800 * 1000,
      after + 1800 * 1000,
    );
  });

  it("mints an idle-less rotated child when the client is infinite-idle", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update(TENANT, { idle_session_lifetime: 2 });
    await env.data.clients.update(TENANT, "clientId", {
      refresh_token: {
        rotation_type: "rotating",
        infinite_idle_token_lifetime: true,
      },
    });
    const seeded = await seed(env, { rotating: true });

    const res = await exchange(oauthApp, env, seeded.wire);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { refresh_token?: string };
    const childParsed = parseRefreshToken(body.refresh_token!);
    if (childParsed.kind !== "new") {
      throw new Error("expected new-format wire token");
    }
    const child = await env.data.refreshTokens.getByLookup(
      TENANT,
      childParsed.lookup,
    );
    expect(child!.idle_expires_at).toBeUndefined();
  });

  it("slides a non-rotating token's idle window by the client idle_token_lifetime", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update(TENANT, { idle_session_lifetime: 2 });
    await env.data.clients.update(TENANT, "clientId", {
      refresh_token: {
        rotation_type: "non-rotating",
        idle_token_lifetime: 1800,
      },
    });
    const seeded = await seed(env, {});

    const before = Date.now();
    const res = await exchange(oauthApp, env, seeded.wire);
    const after = Date.now();
    expect(res.status).toBe(200);

    const stored = await env.data.refreshTokens.get(TENANT, seeded.id);
    expectBetween(
      stored!.idle_expires_at,
      before + 1800 * 1000,
      after + 1800 * 1000,
    );
  });

  it("leaves a non-rotating token's stored idle window untouched when the client is infinite-idle", async () => {
    const { oauthApp, env } = await getTestServer();
    await env.data.tenants.update(TENANT, { idle_session_lifetime: 2 });
    await env.data.clients.update(TENANT, "clientId", {
      refresh_token: {
        rotation_type: "non-rotating",
        infinite_idle_token_lifetime: true,
      },
    });
    const idleExpiresAt = new Date(Date.now() + HOUR_MS).toISOString();
    const seeded = await seed(env, { idle_expires_at: idleExpiresAt });

    const res = await exchange(oauthApp, env, seeded.wire);
    expect(res.status).toBe(200);

    // The update path cannot clear a column, so the window is preserved; the
    // token heals to no idle expiry at the next rotation or fresh mint.
    const stored = await env.data.refreshTokens.get(TENANT, seeded.id);
    expect(stored!.idle_expires_at).toBe(idleExpiresAt);
  });
});
