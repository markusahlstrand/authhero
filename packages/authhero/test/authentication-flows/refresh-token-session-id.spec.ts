import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { ulid } from "../../src/utils/ulid";
import { getTestServer } from "../helpers/test-server";
import {
  generateRefreshTokenParts,
  hashRefreshTokenSecret,
  formatRefreshToken,
} from "../../src/utils/refresh-token-format";
import { createRefreshToken } from "../../src/authentication-flows/common";
import { getEnrichedClient } from "../../src/helpers/client";
import { getPrimaryUserByEmail } from "../../src/helpers/users";
import type { Context } from "hono";
import type { Bindings, Variables } from "../../src/types";

const TENANT = "tenantId";

function fakeCtx(env: Awaited<ReturnType<typeof getTestServer>>["env"]) {
  return {
    env,
    var: { tenant_id: TENANT, ip: "1.2.3.4", useragent: "vitest" },
    req: { header: () => undefined, query: () => undefined },
  } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
}

describe("refresh token auth-event columns", () => {
  it("persists session_id and the auth-event facts at mint", async () => {
    const { env } = await getTestServer();
    const ctx = fakeCtx(env);

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: TENANT,
      email: "foo@example.com",
    });
    if (!client || !user) throw new Error("fixture missing");

    const { row } = await createRefreshToken(ctx, {
      user,
      client,
      login_id: "login-1",
      session_id: "session-1",
      organization: "org_123",
      auth_connection: "google-oauth2",
      auth_strategy: { strategy: "google", strategy_type: "social" },
      scope: "openid offline_access",
    });

    const stored = await env.data.refreshTokens.get(TENANT, row.id);
    expect(stored).toBeTruthy();
    expect(stored!.session_id).toBe("session-1");
    expect(stored!.organization).toBe("org_123");
    expect(stored!.auth_connection).toBe("google-oauth2");
    expect(stored!.auth_strategy).toEqual({
      strategy: "google",
      strategy_type: "social",
    });
    // The provenance link is untouched by the new ownership edge.
    expect(stored!.login_id).toBe("login-1");
  });

  it("leaves the columns absent — not null — when the flow has no session", async () => {
    const { env } = await getTestServer();
    const ctx = fakeCtx(env);

    const client = await getEnrichedClient(env, "clientId");
    const user = await getPrimaryUserByEmail({
      userAdapter: env.data.users,
      tenant_id: TENANT,
      email: "foo@example.com",
    });
    if (!client || !user) throw new Error("fixture missing");

    const { row } = await createRefreshToken(ctx, {
      user,
      client,
      login_id: "login-2",
      scope: "openid offline_access",
    });

    const stored = await env.data.refreshTokens.get(TENANT, row.id);
    // Absent optionals, so the management API response schema accepts them.
    expect(stored!.session_id).toBeUndefined();
    expect(stored!.organization).toBeUndefined();
    expect(stored!.auth_strategy).toBeUndefined();
  });
});

describe("refresh grant reads its own auth-event columns", () => {
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
      login_id: "gone-login-session",
      user_id: "email|userId",
      client_id: "clientId",
      device: DEVICE,
      resource_servers: [{ audience: "http://example.com", scopes: "openid" }],
      rotating: false,
      token_lookup: lookup,
      token_hash,
      family_id: id,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      idle_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      ...overrides,
    });
    return { id, wire: formatRefreshToken(lookup, secret) };
  }

  it("exchanges with no login session present, keeping session_id", async () => {
    const { oauthApp, env } = await getTestServer();
    // No login_sessions row is created at all — this is the orphaned state
    // that today silently drops session_id, organization and connection.
    const seeded = await seed(env, {
      session_id: "session-live",
      // Organization resolution is covered by org-name-in-token.spec.ts and
      // brings a membership check with it; this test is about the facts
      // surviving a missing login session.
      auth_connection: "google-oauth2",
      auth_strategy: { strategy: "google", strategy_type: "social" },
    });

    const res = await testClient(oauthApp, env).oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: seeded.wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": TENANT } },
    );

    expect(res.status).toBe(200);
    // The session is still resolvable, so `used_at` stamping and the session
    // revoke cascade both keep working for an orphaned token.
    const stored = await env.data.refreshTokens.get(TENANT, seeded.id);
    expect(stored!.session_id).toBe("session-live");
  });

  it("still exchanges a legacy row that has no denormalised columns", async () => {
    const { oauthApp, env } = await getTestServer();
    const seeded = await seed(env, {});

    const res = await testClient(oauthApp, env).oauth.token.$post(
      // @ts-expect-error - testClient type requires both form and json
      {
        form: {
          grant_type: "refresh_token",
          refresh_token: seeded.wire,
          client_id: "clientId",
        },
      },
      { headers: { "tenant-id": TENANT } },
    );

    // Falls back to the login-session path, which is exactly today's
    // behaviour — including tolerating a login session that is already gone.
    expect(res.status).toBe(200);
  });
});
