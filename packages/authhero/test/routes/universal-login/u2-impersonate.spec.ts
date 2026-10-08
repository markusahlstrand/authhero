import { describe, it, expect } from "vitest";
import {
  AuthorizationResponseType,
  LoginSessionState,
  LogTypes,
  Strategy,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

const IMPERSONATOR_ID = `${USERNAME_PASSWORD_PROVIDER}|admin`;
const TARGET_ID = `${USERNAME_PASSWORD_PROVIDER}|target`;

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

async function setup(env: TestEnv) {
  for (const [user_id, email] of [
    [IMPERSONATOR_ID, "admin@example.com"],
    [TARGET_ID, "target@example.com"],
  ]) {
    await env.data.users.create("tenantId", {
      user_id,
      email,
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
    });
  }

  await env.data.userPermissions.create("tenantId", IMPERSONATOR_ID, {
    user_id: IMPERSONATOR_ID,
    resource_server_identifier: "https://api.example.com/",
    permission_name: "users:impersonate",
  });

  const loginSession = await env.data.loginSessions.create("tenantId", {
    expires_at: new Date(Date.now() + 600000).toISOString(),
    csrf_token: "csrfToken",
    authParams: {
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      scope: "openid email profile",
      response_type: AuthorizationResponseType.CODE,
      state: "auth-state",
      nonce: "nonce",
    },
    state: LoginSessionState.AWAITING_HOOK,
    state_data: JSON.stringify({ hookId: "page:impersonate" }),
  });

  const session = await env.data.sessions.create("tenantId", {
    id: "impersonation-session",
    login_session_id: loginSession.id,
    user_id: IMPERSONATOR_ID,
    clients: ["clientId"],
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    used_at: new Date().toISOString(),
    device: {
      last_ip: "",
      initial_ip: "",
      last_user_agent: "",
      initial_user_agent: "",
      initial_asn: "",
      last_asn: "",
    },
  });

  await env.data.loginSessions.update("tenantId", loginSession.id, {
    session_id: session.id,
    user_id: IMPERSONATOR_ID,
  });

  return { state: loginSession.id, sessionId: session.id };
}

async function postScreen(
  u2App: Awaited<ReturnType<typeof getTestServer>>["u2App"],
  env: TestEnv,
  state: string,
  data: Record<string, string>,
) {
  return u2App.request(
    `/screen/impersonate?state=${encodeURIComponent(state)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    },
    env,
  );
}

describe("u2 impersonate screen", () => {
  it("renders a continue button and a separate impersonate box", async () => {
    const { u2App, env } = await getTestServer();
    const { state } = await setup(env);

    const response = await u2App.request(
      `/screen/impersonate?state=${encodeURIComponent(state)}`,
      { method: "GET", headers: { Accept: "application/json" } },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    const components: { id: string; type: string }[] = body.screen.components;
    expect(components.map((c) => c.id)).toEqual([
      "current-user",
      "continue",
      "divider",
      "user_id",
      "impersonate",
    ]);
    expect(JSON.stringify(body.screen)).toContain("admin@example.com");
  });

  it("continues as the current user even if a user id was typed", async () => {
    const { u2App, env } = await getTestServer();
    const { state, sessionId } = await setup(env);

    const response = await postScreen(u2App, env, state, {
      continue: "true",
      user_id: TARGET_ID,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const redirect = new URL(body.redirect);
    expect(redirect.pathname).toBe("/callback");
    expect(redirect.searchParams.get("code")).toBeTruthy();

    const session = await env.data.sessions.get("tenantId", sessionId);
    expect(session?.user_id).toBe(IMPERSONATOR_ID);

    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession?.state).not.toBe(LoginSessionState.AWAITING_HOOK);
  });

  it("impersonates the entered user", async () => {
    const { u2App, env } = await getTestServer();
    const { state, sessionId } = await setup(env);

    const response = await postScreen(u2App, env, state, {
      impersonate: "true",
      user_id: TARGET_ID,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const redirect = new URL(body.redirect);
    expect(redirect.searchParams.get("code")).toBeTruthy();

    const session = await env.data.sessions.get("tenantId", sessionId);
    expect(session?.user_id).toBe(TARGET_ID);

    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession?.state).not.toBe(LoginSessionState.AWAITING_HOOK);

    const { logs } = await env.data.logs.list("tenantId");
    const log = logs.find((l) => l.type === LogTypes.SUCCESS_IMPERSONATION);
    expect(log?.user_id).toBe(TARGET_ID);
  });

  it("requires a user id when the impersonate button is clicked", async () => {
    const { u2App, env } = await getTestServer();
    const { state, sessionId } = await setup(env);

    const response = await postScreen(u2App, env, state, {
      impersonate: "true",
      user_id: "  ",
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain(
      "User ID is required",
    );

    const session = await env.data.sessions.get("tenantId", sessionId);
    expect(session?.user_id).toBe(IMPERSONATOR_ID);
  });

  it("shows an error for an unknown user", async () => {
    const { u2App, env } = await getTestServer();
    const { state } = await setup(env);

    const response = await postScreen(u2App, env, state, {
      impersonate: "true",
      user_id: "auth2|missing",
    });

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("User not found");
  });
});
