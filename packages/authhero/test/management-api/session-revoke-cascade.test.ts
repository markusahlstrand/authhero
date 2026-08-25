import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import { cleanupSessions } from "../../src/helpers/user-session-cleanup";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

const TENANT = "tenantId";
const USER_ID = `${USERNAME_PASSWORD_PROVIDER}|session-cascade`;

const device = {
  last_ip: "",
  initial_ip: "",
  last_user_agent: "",
  initial_user_agent: "",
  initial_asn: "",
  last_asn: "",
};

type Env = Awaited<ReturnType<typeof getTestServer>>["env"];

async function createUser(env: Env) {
  await env.data.users.create(TENANT, {
    email: "session-cascade@example.com",
    email_verified: true,
    connection: Strategy.USERNAME_PASSWORD,
    provider: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    user_id: USER_ID,
  });
}

async function createSession(
  env: Env,
  id: string,
  loginSessionId: string,
  expiresAt = new Date(Date.now() + 3600_000).toISOString(),
) {
  return env.data.sessions.create(TENANT, {
    id,
    user_id: USER_ID,
    used_at: new Date().toISOString(),
    login_session_id: loginSessionId,
    device,
    expires_at: expiresAt,
    idle_expires_at: expiresAt,
    clients: ["clientId"],
  });
}

async function createLoginSession(env: Env) {
  return env.data.loginSessions.create(TENANT, {
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    csrf_token: "csrf",
    authParams: { client_id: "clientId" },
  });
}

async function createToken(
  env: Env,
  id: string,
  login_id: string,
  session_id?: string,
) {
  return env.data.refreshTokens.create(TENANT, {
    id,
    login_id,
    session_id,
    user_id: USER_ID,
    client_id: "clientId",
    device,
    resource_servers: [],
    rotating: false,
    expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
    idle_expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  });
}

/**
 * One session that two login sessions fed — the SSO re-authorization shape —
 * plus a second session for the same user that must survive untouched.
 */
async function seed(env: Env) {
  await createUser(env);
  const firstLogin = await createLoginSession(env);
  const laterLogin = await createLoginSession(env);
  const otherLogin = await createLoginSession(env);

  const session = await createSession(env, "sess-cascade", firstLogin.id);
  await createSession(env, "sess-other", otherLogin.id);

  // Minted at the session's originating login...
  await createToken(env, "rt-first-login", firstLogin.id, session.id);
  // ...and during a later re-authorization, which `sessions.login_session_id`
  // never records. Only the session_id edge reaches this one.
  await createToken(env, "rt-later-login", laterLogin.id, session.id);
  // A row from before session_id existed, reachable only via login_id.
  await createToken(env, "rt-legacy", firstLogin.id, undefined);
  // Another session's token for the same user.
  await createToken(env, "rt-other-session", otherLogin.id, "sess-other");

  return { session };
}

async function revokedAt(env: Env, id: string) {
  const token = await env.data.refreshTokens.get(TENANT, id);
  return token?.revoked_at;
}

describe("management-api session revocation cascades to refresh tokens", () => {
  it("POST /sessions/{id}/revoke revokes the session's refresh tokens", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const res = await managementApp.request(
      "/sessions/sess-cascade/revoke",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT },
      },
      env,
    );
    expect(res.status).toBe(202);

    expect(await revokedAt(env, "rt-first-login")).toBeTruthy();
    expect(await revokedAt(env, "rt-later-login")).toBeTruthy();
    // The legacy row has no session_id; the retained login sweep still gets it.
    expect(await revokedAt(env, "rt-legacy")).toBeTruthy();
    // A different session for the same user is not collateral.
    expect(await revokedAt(env, "rt-other-session")).toBeFalsy();

    expect(
      (await env.data.sessions.get(TENANT, "sess-cascade"))!.revoked_at,
    ).toBeTruthy();
  });

  it("DELETE /sessions/{id} revokes them too", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const res = await managementApp.request(
      "/sessions/sess-cascade",
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT },
      },
      env,
    );
    expect(res.status).toBe(200);

    expect(await revokedAt(env, "rt-first-login")).toBeTruthy();
    expect(await revokedAt(env, "rt-later-login")).toBeTruthy();
    expect(await revokedAt(env, "rt-other-session")).toBeFalsy();

    expect(await env.data.sessions.get(TENANT, "sess-cascade")).toBeNull();
  });

  it("records the revoked count in the audit log", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    await managementApp.request(
      "/sessions/sess-cascade/revoke",
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "tenant-id": TENANT },
      },
      env,
    );

    const { logs } = await env.data.logs.list(TENANT, { per_page: 50 });
    const entry = logs.find((l) =>
      l.description?.startsWith("Revoke a Session"),
    );
    expect(entry?.description).toBe(
      "Revoke a Session (revoked 3 refresh token(s))",
    );
  });

  it("a session that merely expires does not revoke its refresh tokens", async () => {
    const { env } = await getTestServer();
    await createUser(env);
    const login = await createLoginSession(env);
    await createSession(
      env,
      "sess-expired",
      login.id,
      new Date(Date.now() - 60_000).toISOString(),
    );
    await createToken(env, "rt-outlives", login.id, "sess-expired");

    // Nothing revokes on expiry — the grant's own checks handle an expired
    // session, and a refresh token is designed to outlive one.
    expect(await revokedAt(env, "rt-outlives")).toBeFalsy();
    expect(
      (await env.data.sessions.get(TENANT, "sess-expired"))!.revoked_at,
    ).toBeFalsy();
  });

  it("cleanup deleting an expired session leaves its refresh tokens alone", async () => {
    const { env } = await getTestServer();
    await createUser(env);
    const login = await createLoginSession(env);
    // Past the cleanup grace period.
    const longExpired = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    await createSession(env, "sess-reaped", login.id, longExpired);
    await createToken(env, "rt-survives", login.id, "sess-reaped");

    await cleanupSessions(env.data, { tenantId: TENANT });

    expect(await env.data.sessions.get(TENANT, "sess-reaped")).toBeNull();
    const survivor = await env.data.refreshTokens.get(TENANT, "rt-survives");
    expect(survivor).toBeTruthy();
    expect(survivor!.revoked_at).toBeFalsy();
  });
  it("blocking a user revokes tokens from every login that fed the session", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();
    await seed(env);

    const res = await managementApp.request(
      `/users/${encodeURIComponent(USER_ID)}`,
      {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": TENANT,
          "content-type": "application/json",
        },
        body: JSON.stringify({ blocked: true }),
      },
      env,
    );
    expect(res.status).toBe(200);

    // The block path used to resolve through `sessions.login_session_id`,
    // which records only the originating login — so this one survived.
    expect(await revokedAt(env, "rt-later-login")).toBeTruthy();
    // Blocking ends every session, so the other session's token goes too.
    expect(await revokedAt(env, "rt-other-session")).toBeTruthy();
  });
});
