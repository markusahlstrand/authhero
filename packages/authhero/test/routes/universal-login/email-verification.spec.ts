import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";
import {
  AuthorizationResponseType,
  LoginSessionState,
  Strategy,
} from "@authhero/adapter-interfaces";

type ScreenJson = {
  redirect?: string;
  screen?: {
    name?: string;
    action?: string;
    description?: string;
    messages?: Array<{ text: string; type: string }>;
    components: Array<{
      id: string;
      type: string;
      messages?: Array<{ text: string; type: string }>;
    }>;
  };
};

const USER_ID = `${USERNAME_PASSWORD_PROVIDER}|unverifiedUserId`;
const EMAIL = "unverified@example.com";
const PASSWORD = "Password1!";

async function setup({
  method,
  identifierFirst = true,
}: {
  method?: "link" | "code";
  identifierFirst?: boolean;
} = {}) {
  const server = await getTestServer({ mockEmail: true });
  const { env, oauthApp } = server;

  await env.data.clients.update("tenantId", "clientId", {
    client_metadata: {
      email_validation: "enforced",
      universal_login_version: "2",
    },
  });
  await env.data.connections.update("tenantId", Strategy.USERNAME_PASSWORD, {
    strategy: Strategy.USERNAME_PASSWORD,
    ...(method
      ? { options: { attributes: { email: { verification_method: method } } } }
      : {}),
  });
  await env.data.clientConnections.updateByClient("tenantId", "clientId", [
    Strategy.USERNAME_PASSWORD,
  ]);
  await env.data.promptSettings.set("tenantId", {
    identifier_first: identifierFirst,
  });

  await env.data.users.create("tenantId", {
    email: EMAIL,
    email_verified: false,
    connection: Strategy.USERNAME_PASSWORD,
    provider: USERNAME_PASSWORD_PROVIDER,
    is_social: false,
    user_id: USER_ID,
  });
  await env.data.passwords.create("tenantId", {
    user_id: USER_ID,
    password: await bcryptjs.hash(PASSWORD, 10),
    algorithm: "bcrypt",
  });

  const state = await startLogin(server);
  return { ...server, state };
}

async function startLogin(
  server: Awaited<ReturnType<typeof getTestServer>>,
): Promise<string> {
  const { env, oauthApp } = server;
  const oauthClient = testClient(oauthApp, env);
  const authorizeResponse = await oauthClient.authorize.$get({
    query: {
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      state: "state",
      nonce: "nonce",
      scope: "openid email profile",
      response_type: AuthorizationResponseType.CODE,
    },
  });
  const location = authorizeResponse.headers.get("location");
  const state = new URL(`https://example.com${location}`).searchParams.get(
    "state",
  )!;

  // Simulate the identifier step having recorded the email
  const loginSession = await env.data.loginSessions.get("tenantId", state);
  await env.data.loginSessions.update("tenantId", state, {
    authParams: { ...loginSession!.authParams, username: EMAIL },
  });
  return state;
}

async function postScreen(
  u2App: any,
  env: any,
  screenId: string,
  state: string,
  data: Record<string, string>,
): Promise<ScreenJson> {
  const response = await u2App.request(
    `/screen/${screenId}?state=${encodeURIComponent(state)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    },
    env,
  );
  return response.json();
}

describe("u2 login email verification (code)", () => {
  it("defaults to the code screen and continues the same login", async () => {
    const { u2App, env, state, getSentEmails } = await setup();

    const result = await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });

    expect(result.screen?.name).toBe("email-verification-code");
    expect(result.screen?.description).toContain("un***@example.com");

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(EMAIL);
    expect(sent[0].template).toBeDefined();
    const code = sent[0].data.code;
    expect(code).toMatch(/^\d{6}$/);

    // The session must stay usable for the code step
    const pending = await env.data.loginSessions.get("tenantId", state);
    expect(pending?.state).not.toBe(LoginSessionState.FAILED);

    const wrong = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { code: code === "000000" ? "111111" : "000000" },
    );
    expect(wrong.screen?.name).toBe("email-verification-code");
    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(false);

    const ok = await postScreen(u2App, env, "email-verification-code", state, {
      code,
    });
    expect(ok.redirect).toBeDefined();
    expect(ok.redirect).toContain("https://example.com/callback");
    expect(ok.redirect).toContain("code=");

    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(true);

    // Single use
    const reused = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { code },
    );
    expect(reused.redirect).toBeUndefined();
  });

  it("rejects a code issued for another login session", async () => {
    const server = await setup();
    const { u2App, env, state, getSentEmails } = server;

    await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });
    const code = getSentEmails()[0].data.code;

    const otherState = await startLogin(server);
    const result = await postScreen(
      u2App,
      env,
      "email-verification-code",
      otherState,
      { code },
    );
    expect(result.redirect).toBeUndefined();
    expect(result.screen?.name).toBe("email-verification-code");
    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(false);
  });

  it("resends a new code", async () => {
    const { u2App, env, state, getSentEmails } = await setup();

    await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });
    const resend = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { action: "resend" },
    );

    expect(resend.screen?.name).toBe("email-verification-code");
    expect(resend.screen?.messages?.[0]?.type).toBe("success");
    const sent = getSentEmails();
    expect(sent).toHaveLength(2);

    const ok = await postScreen(u2App, env, "email-verification-code", state, {
      code: sent[1].data.code,
    });
    expect(ok.redirect).toContain("https://example.com/callback");
  });

  it("shows the code screen from the combined login page", async () => {
    const { u2App, env, state, getSentEmails } = await setup({
      identifierFirst: false,
    });

    const result = await postScreen(u2App, env, "login", state, {
      username: EMAIL,
      password: PASSWORD,
    });

    expect(result.screen?.name).toBe("email-verification-code");
    expect(getSentEmails()).toHaveLength(1);
  });
});

describe("u2 login email verification (link)", () => {
  it("shows the link-sent screen and the link returns to the login", async () => {
    const { u2App, env, state, getSentEmails } = await setup({
      method: "link",
    });

    const result = await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });
    expect(result.screen?.name).toBe("email-verification-link-sent");

    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    const verificationUrl = new URL(sent[0].data.emailValidationUrl);
    expect(verificationUrl.pathname).toBe("/u2/tickets/email-verification");

    const ticketResponse = await u2App.request(
      `/tickets/email-verification${verificationUrl.search}`,
      { method: "GET" },
      env,
    );
    expect(ticketResponse.status).toBe(302);
    const returnUrl = new URL(ticketResponse.headers.get("location")!);
    expect(returnUrl.pathname).toBe("/u2/login/identifier");
    expect(returnUrl.searchParams.get("state")).toBe(state);

    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(true);

    // The session was kept alive, so logging in again completes it
    const retry = await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });
    expect(retry.redirect).toContain("https://example.com/callback");
  });

  it("resends the link", async () => {
    const { u2App, env, state, getSentEmails } = await setup({
      method: "link",
    });

    await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });
    const resend = await postScreen(
      u2App,
      env,
      "email-verification-link-sent",
      state,
      { action: "resend" },
    );

    expect(resend.screen?.name).toBe("email-verification-link-sent");
    expect(resend.screen?.messages?.[0]?.type).toBe("success");
    expect(getSentEmails()).toHaveLength(2);
  });
});

describe("u2 signup with enforced email verification", () => {
  it("sends a single verification email and shows the code screen", async () => {
    const { u2App, env, state, getSentEmails } = await setup();

    const result = await postScreen(u2App, env, "signup", state, {
      email: "new-user@example.com",
      password: "NewPassword1!",
      re_password: "NewPassword1!",
    });

    expect(result.screen?.name).toBe("email-verification-code");
    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("new-user@example.com");
    expect(sent[0].data.code).toMatch(/^\d{6}$/);
  });

  it("logs the signup, verification and login like Auth0", async () => {
    const { u2App, env, state, getSentEmails } = await setup();

    await postScreen(u2App, env, "signup", state, {
      email: "new-user@example.com",
      password: "NewPassword1!",
      re_password: "NewPassword1!",
    });
    const ok = await postScreen(u2App, env, "email-verification-code", state, {
      code: getSentEmails()[0].data.code,
    });
    expect(ok.redirect).toContain("code=");

    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    const byType = (type: string) => logs.filter((l) => l.type === type);

    // A signup continuing into the verification step is not a failed login
    expect(byType("f")).toHaveLength(0);

    const [signup] = byType("ss");
    expect(signup?.user_name).toBe("new-user@example.com");
    expect(signup?.connection).toBe(Strategy.USERNAME_PASSWORD);
    expect(signup?.strategy_type).toBe("database");

    const [request] = byType("svr");
    expect(request?.description).toBe(
      "Verification code sent to new-user@example.com",
    );

    const [verified] = byType("sv");
    expect(verified?.user_id).toBe(signup?.user_id);
    expect(verified?.connection).toBe(Strategy.USERNAME_PASSWORD);
    expect(verified?.strategy_type).toBe("database");

    expect(byType("s")).toHaveLength(1);
  });
});

describe("u2 login email verification requires a validated password", () => {
  const OTHER_USER_ID = `${USERNAME_PASSWORD_PROVIDER}|otherUserId`;
  const OTHER_EMAIL = "other@example.com";

  // A login email-verification code bound to the session, as the screens
  // would mint one, without going through the password step.
  async function plantCode(
    env: Awaited<ReturnType<typeof setup>>["env"],
    state: string,
    userId: string,
    codeId: string,
  ) {
    await env.data.codes.create("tenantId", {
      code_id: codeId,
      code_type: "email_verification",
      login_id: state,
      user_id: userId,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      state: JSON.stringify({
        purpose: "login_email_verification",
        connection: Strategy.USERNAME_PASSWORD,
      }),
    });
  }

  async function createOtherUser(
    env: Awaited<ReturnType<typeof setup>>["env"],
  ) {
    await env.data.users.create("tenantId", {
      email: OTHER_EMAIL,
      email_verified: false,
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: OTHER_USER_ID,
    });
  }

  it("rejects a resend after only the identifier step and cannot complete the login", async () => {
    const { u2App, env, state, getSentEmails } = await setup();

    const resend = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { action: "resend" },
    );
    expect(resend.redirect).toBeUndefined();
    expect(resend.screen?.name).toBe("email-verification-code");
    const codeField = resend.screen?.components.find((c) => c.id === "code");
    expect(codeField?.messages?.[0]?.type).toBe("error");
    expect(getSentEmails()).toHaveLength(0);

    const redeem = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { code: "123456" },
    );
    expect(redeem.redirect).toBeUndefined();
    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(false);
  });

  it("rejects a link resend after only the identifier step", async () => {
    const { u2App, env, state, getSentEmails } = await setup({
      method: "link",
    });

    const resend = await postScreen(
      u2App,
      env,
      "email-verification-link-sent",
      state,
      { action: "resend" },
    );
    expect(resend.screen?.name).toBe("email-verification-link-sent");
    expect(resend.screen?.messages?.[0]?.type).toBe("error");
    expect(getSentEmails()).toHaveLength(0);
  });

  it("rejects redeeming a code when the password was never validated", async () => {
    const { u2App, env, state } = await setup();
    await plantCode(env, state, USER_ID, "123456");

    const json = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { code: "123456" },
    );
    expect(json.redirect).toBeUndefined();

    // The no-JS form route runs the same handler
    const form = await u2App.request(
      `/login/email-verification?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: "123456" }).toString(),
      },
      env,
    );
    expect(form.headers.get("location") ?? "").not.toContain(
      "https://example.com/callback",
    );

    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(false);
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession?.state).toBe(LoginSessionState.PENDING);
  });

  it("rejects a code minted for a different user than the password step validated", async () => {
    const { u2App, env, state, getSentEmails } = await setup();
    await createOtherUser(env);

    await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });
    const realCode = getSentEmails()[0].data.code;
    const otherCode = realCode === "654321" ? "123456" : "654321";
    await plantCode(env, state, OTHER_USER_ID, otherCode);

    const result = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { code: otherCode },
    );
    expect(result.redirect).toBeUndefined();
    expect(
      (await env.data.users.get("tenantId", OTHER_USER_ID))?.email_verified,
    ).toBe(false);
  });

  it("resends to the password-validated user even if the session username changes", async () => {
    const { u2App, env, state, getSentEmails } = await setup();
    await createOtherUser(env);

    await postScreen(u2App, env, "enter-password", state, {
      password: PASSWORD,
    });

    // Re-running the identifier step rewrites the session username
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    await env.data.loginSessions.update("tenantId", state, {
      authParams: { ...loginSession!.authParams, username: OTHER_EMAIL },
    });

    const resend = await postScreen(
      u2App,
      env,
      "email-verification-code",
      state,
      { action: "resend" },
    );
    expect(resend.screen?.messages?.[0]?.type).toBe("success");

    const sent = getSentEmails();
    expect(sent).toHaveLength(2);
    expect(sent[1].to).toBe(EMAIL);

    const ok = await postScreen(u2App, env, "email-verification-code", state, {
      code: sent[1].data.code,
    });
    expect(ok.redirect).toContain("https://example.com/callback");
    expect(
      (await env.data.users.get("tenantId", USER_ID))?.email_verified,
    ).toBe(true);
    expect(
      (await env.data.users.get("tenantId", OTHER_USER_ID))?.email_verified,
    ).toBe(false);
  });
});
