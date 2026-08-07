import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

const TENANT = "tenantId";
const USER_ID = `${USERNAME_PASSWORD_PROVIDER}|patch-block`;

describe("management-api user blocked", () => {
  it("PATCH blocked round-trips and revokes the user's sessions", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    await env.data.users.create(TENANT, {
      email: "patch-block@example.com",
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: USER_ID,
    });

    // Give the user an active session + login session.
    const loginSession = await env.data.loginSessions.create(TENANT, {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrf",
      authParams: { client_id: "clientId" },
    });
    const session = await env.data.sessions.create(TENANT, {
      id: "block-session",
      user_id: USER_ID,
      used_at: new Date().toISOString(),
      login_session_id: loginSession.id,
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      idle_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
    });

    // Block the user via the management API.
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
    expect((await res.json()).blocked).toBe(true);

    // The field persisted.
    const fetched = await env.data.users.get(TENANT, USER_ID);
    expect(fetched!.blocked).toBe(true);

    // The session was revoked.
    const revoked = await env.data.sessions.get(TENANT, session.id);
    expect(revoked!.revoked_at).toBeTruthy();
  });
});
