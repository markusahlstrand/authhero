import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import type { Context } from "hono";
import { getTestServer } from "../helpers/test-server";
import { createRefreshToken } from "../../src/authentication-flows/common";
import { getEnrichedClient } from "../../src/helpers/client";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import {
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
  formatRefreshToken,
  parseRefreshToken,
} from "../../src/utils/refresh-token-format";
import { ulid } from "../../src/utils/ulid";
import type { Bindings, Variables } from "../../src/types";
import type { Client } from "@authhero/adapter-interfaces";

const TENANT = "tenantId";
const CLIENT = "clientId";
const HOUR_MS = 60 * 60 * 1000;

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

interface TokenResponse {
  refresh_token?: string;
}

interface ErrorResponse {
  error: string;
  error_description?: string;
}

function fakeCtx(env: TestEnv) {
  return {
    env,
    var: { tenant_id: TENANT, ip: "1.2.3.4", useragent: "vitest" },
    req: { header: () => undefined, query: () => undefined },
  } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
}

/**
 * Tenant lifetimes both set, so any test asserting a client-derived expiry is
 * really asserting the client won — not that the tenant had nothing to say.
 */
async function setTenantLifetimes(env: TestEnv) {
  await env.data.tenants.update(TENANT, {
    session_lifetime: 24 * 30, // 30 days (hours)
    idle_session_lifetime: 24 * 7, // 7 days (hours)
  });
}

async function setClientRefreshToken(
  env: TestEnv,
  refresh_token: Client["refresh_token"],
) {
  await env.data.clients.update(TENANT, CLIENT, { refresh_token });
}

async function mintRefreshToken(env: TestEnv) {
  const client = await getEnrichedClient(env, CLIENT);
  const user = await getPrimaryUserByEmail({
    userAdapter: env.data.users,
    tenant_id: TENANT,
    email: "foo@example.com",
  });
  if (!client || !user) throw new Error("fixture missing");

  const { row } = await createRefreshToken(fakeCtx(env), {
    user,
    client,
    login_id: "login-1",
    session_id: "session-1",
    scope: "openid offline_access",
  });
  return row;
}

async function seedToken(
  env: TestEnv,
  overrides: {
    rotating?: boolean;
    expires_at?: string;
    idle_expires_at?: string;
  } = {},
) {
  const id = ulid();
  const { lookup, secret } = generateRefreshTokenParts();
  const token_hash = await hashRefreshTokenSecret(secret);
  await env.data.refreshTokens.create(TENANT, {
    id,
    login_id: "loginSessionId",
    session_id: "session-1",
    user_id: "email|userId",
    client_id: CLIENT,
    resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
    device: {
      last_ip: "",
      initial_ip: "",
      last_user_agent: "",
      initial_user_agent: "",
      initial_asn: "",
      last_asn: "",
    },
    rotating: overrides.rotating ?? false,
    token_lookup: lookup,
    token_hash,
    family_id: id,
    expires_at: overrides.expires_at,
    idle_expires_at: overrides.idle_expires_at,
  });
  return { id, wire: formatRefreshToken(lookup, secret) };
}

async function exchange(
  oauthApp: Parameters<typeof testClient>[0],
  env: TestEnv,
  wire: string,
) {
  return testClient(oauthApp, env).oauth.token.$post(
    // @ts-expect-error - testClient type requires both form and json
    {
      form: {
        grant_type: "refresh_token",
        refresh_token: wire,
        client_id: CLIENT,
      },
    },
    { headers: { "tenant-id": TENANT } },
  );
}

function secondsFromNow(iso: string | undefined): number {
  if (!iso) throw new Error("expected an expiry timestamp");
  return (new Date(iso).getTime() - Date.now()) / 1000;
}

describe("per-client refresh token lifetimes", () => {
  describe("at mint", () => {
    it("uses the client's token_lifetime / idle_token_lifetime over the tenant's session lifetimes", async () => {
      const { env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        token_lifetime: 2 * 60 * 60, // 2 hours
        idle_token_lifetime: 15 * 60, // 15 minutes
      });

      const row = await mintRefreshToken(env);

      expect(secondsFromNow(row.expires_at)).toBeGreaterThan(2 * 3600 - 60);
      expect(secondsFromNow(row.expires_at)).toBeLessThanOrEqual(2 * 3600);
      expect(secondsFromNow(row.idle_expires_at)).toBeGreaterThan(15 * 60 - 60);
      expect(secondsFromNow(row.idle_expires_at)).toBeLessThanOrEqual(15 * 60);
    });

    it("omits the absolute expiry for infinite_token_lifetime", async () => {
      const { env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        infinite_token_lifetime: true,
        idle_token_lifetime: 15 * 60,
      });

      const row = await mintRefreshToken(env);

      expect(row.expires_at).toBeFalsy();
      expect(secondsFromNow(row.idle_expires_at)).toBeLessThanOrEqual(15 * 60);
    });

    it("omits the idle expiry for infinite_idle_token_lifetime", async () => {
      const { env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        token_lifetime: 2 * 60 * 60,
        infinite_idle_token_lifetime: true,
      });

      const row = await mintRefreshToken(env);

      expect(row.idle_expires_at).toBeFalsy();
      expect(secondsFromNow(row.expires_at)).toBeLessThanOrEqual(2 * 3600);
    });

    it("omits both expiries for expiration_type: non-expiring", async () => {
      const { env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, { expiration_type: "non-expiring" });

      const row = await mintRefreshToken(env);

      expect(row.expires_at).toBeFalsy();
      expect(row.idle_expires_at).toBeFalsy();
    });

    it("falls back to the tenant session lifetimes when the client is unconfigured", async () => {
      const { env } = await getTestServer();
      await setTenantLifetimes(env);

      const row = await mintRefreshToken(env);

      // 30 days absolute / 7 days idle, from the tenant.
      expect(secondsFromNow(row.expires_at)).toBeGreaterThan(29 * 24 * 3600);
      expect(secondsFromNow(row.idle_expires_at)).toBeGreaterThan(
        6 * 24 * 3600,
      );
    });
  });

  describe("on exchange", () => {
    it("rejects a token past its client-derived expiry", async () => {
      const { oauthApp, env } = await getTestServer();
      await setClientRefreshToken(env, { token_lifetime: 60 });
      // Minted an hour ago under a 60s lifetime: expired.
      const seeded = await seedToken(env, {
        expires_at: new Date(Date.now() - HOUR_MS).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);

      expect(response.status === 400 || response.status === 403).toBe(true);
      const body = (await response.json()) as ErrorResponse;
      expect(body.error).toBe("invalid_grant");
      expect(body.error_description).toBe("Refresh token has expired");
    });

    it("slides a non-rotating token's idle window by the client's idle_token_lifetime", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "non-rotating",
        idle_token_lifetime: 30 * 60, // 30 minutes
      });
      const seeded = await seedToken(env, {
        idle_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);

      const row = await env.data.refreshTokens.get(TENANT, seeded.id);
      // The tenant would have given 7 days; the client's 30 minutes wins.
      expect(secondsFromNow(row?.idle_expires_at)).toBeGreaterThan(
        30 * 60 - 60,
      );
      expect(secondsFromNow(row?.idle_expires_at)).toBeLessThanOrEqual(30 * 60);
    });

    it("drops a non-rotating row's inherited expiries when the client is switched to non-expiring", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "non-rotating",
        expiration_type: "non-expiring",
      });
      // Stamped under the old config; the client has since been switched.
      const seeded = await seedToken(env, {
        expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
        idle_expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);

      const row = await env.data.refreshTokens.get(TENANT, seeded.id);
      expect(row?.expires_at).toBeFalsy();
      expect(row?.idle_expires_at).toBeFalsy();
    });

    it("drops only the absolute expiry of a non-rotating row for infinite_token_lifetime", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "non-rotating",
        infinite_token_lifetime: true,
        idle_token_lifetime: 30 * 60,
      });
      const seeded = await seedToken(env, {
        expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
        idle_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);

      const row = await env.data.refreshTokens.get(TENANT, seeded.id);
      expect(row?.expires_at).toBeFalsy();
      // The idle window is still bounded — and still slides.
      expect(secondsFromNow(row?.idle_expires_at)).toBeGreaterThan(
        30 * 60 - 60,
      );
      expect(secondsFromNow(row?.idle_expires_at)).toBeLessThanOrEqual(30 * 60);
    });

    it("clears only the idle window of a non-rotating row for infinite_idle_token_lifetime", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "non-rotating",
        token_lifetime: 30 * 24 * 60 * 60,
        infinite_idle_token_lifetime: true,
      });
      const expires_at = new Date(Date.now() + HOUR_MS).toISOString();
      // Stamped with an idle window under the old config; the client has
      // since gone infinite-idle. The in-place path has to clear the stored
      // column explicitly — leaving it in place would let a stale window
      // reject the token with invalid_grant later.
      const seeded = await seedToken(env, {
        expires_at,
        idle_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      });

      const first = await exchange(oauthApp, env, seeded.wire);
      expect(first.status).toBe(200);

      const row = await env.data.refreshTokens.get(TENANT, seeded.id);
      expect(row?.idle_expires_at).toBeFalsy();
      // The absolute expiry is untouched — neither extended nor cleared.
      expect(row?.expires_at).toBe(expires_at);

      // With no idle window left on the row, the same token keeps working.
      const second = await exchange(oauthApp, env, seeded.wire);
      expect(second.status).toBe(200);
    });

    it("never extends a non-rotating row's absolute expiry", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "non-rotating",
        token_lifetime: 30 * 24 * 60 * 60,
        idle_token_lifetime: 30 * 60,
      });
      const expires_at = new Date(Date.now() + HOUR_MS).toISOString();
      const seeded = await seedToken(env, {
        expires_at,
        idle_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);

      const row = await env.data.refreshTokens.get(TENANT, seeded.id);
      expect(row?.expires_at).toBe(expires_at);
    });

    it("slides a rotated child's idle window by the client's idle_token_lifetime", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "rotating",
        idle_token_lifetime: 30 * 60,
      });
      const seeded = await seedToken(env, {
        rotating: true,
        expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
        idle_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      const parsed = parseRefreshToken(body.refresh_token!);
      if (parsed.kind !== "new") throw new Error("expected new-format token");
      const child = await env.data.refreshTokens.getByLookup(
        TENANT,
        parsed.lookup,
      );

      expect(secondsFromNow(child?.idle_expires_at)).toBeGreaterThan(
        30 * 60 - 60,
      );
      expect(secondsFromNow(child?.idle_expires_at)).toBeLessThanOrEqual(
        30 * 60,
      );
      // Absolute expiry is still inherited, never extended by rotation.
      expect(child?.expires_at).toBe(
        (await env.data.refreshTokens.get(TENANT, seeded.id))?.expires_at,
      );
    });

    it("mints an idle-less rotated child for infinite_idle_token_lifetime", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "rotating",
        infinite_idle_token_lifetime: true,
      });
      const expires_at = new Date(Date.now() + HOUR_MS).toISOString();
      const seeded = await seedToken(env, {
        rotating: true,
        expires_at,
        idle_expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      const parsed = parseRefreshToken(body.refresh_token!);
      if (parsed.kind !== "new") throw new Error("expected new-format token");
      const child = await env.data.refreshTokens.getByLookup(
        TENANT,
        parsed.lookup,
      );

      expect(child).toBeTruthy();
      expect(child?.idle_expires_at).toBeFalsy();
      // Only the idle axis is infinite; the absolute expiry is still inherited.
      expect(child?.expires_at).toBe(expires_at);
    });

    it("drops the inherited expiries when the client is switched to non-expiring", async () => {
      const { oauthApp, env } = await getTestServer();
      await setTenantLifetimes(env);
      await setClientRefreshToken(env, {
        rotation_type: "rotating",
        expiration_type: "non-expiring",
      });
      const seeded = await seedToken(env, {
        rotating: true,
        expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
        idle_expires_at: new Date(Date.now() + HOUR_MS).toISOString(),
      });

      const response = await exchange(oauthApp, env, seeded.wire);
      expect(response.status).toBe(200);
      const body = (await response.json()) as TokenResponse;

      const parsed = parseRefreshToken(body.refresh_token!);
      if (parsed.kind !== "new") throw new Error("expected new-format token");
      const child = await env.data.refreshTokens.getByLookup(
        TENANT,
        parsed.lookup,
      );

      expect(child).toBeTruthy();
      expect(child?.expires_at).toBeFalsy();
      expect(child?.idle_expires_at).toBeFalsy();
    });
  });
});
