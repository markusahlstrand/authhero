import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";
import {
  AuthorizationResponseType,
  Strategy,
} from "@authhero/adapter-interfaces";

type ScreenJson = {
  screen: {
    name?: string;
    components: Array<{
      id: string;
      type: string;
      config?: Record<string, unknown>;
    }>;
  };
};

async function setup({
  identifierFirst,
  withPassword = true,
}: {
  identifierFirst: boolean;
  withPassword?: boolean;
}) {
  const server = await getTestServer({ mockEmail: true });
  const { env, oauthApp } = server;

  await env.data.connections.update("tenantId", Strategy.USERNAME_PASSWORD, {
    strategy: Strategy.USERNAME_PASSWORD,
  });
  // The seeded email connection sends magic links; the switch is code-only
  await env.data.connections.update("tenantId", "email", {
    options: { authentication_method: "code" },
  });
  await env.data.clientConnections.updateByClient("tenantId", "clientId", [
    Strategy.USERNAME_PASSWORD,
    "email",
  ]);
  await env.data.promptSettings.set("tenantId", {
    identifier_first: identifierFirst,
  });

  if (withPassword) {
    await env.data.users.create("tenantId", {
      email: "both@example.com",
      email_verified: true,
      connection: Strategy.USERNAME_PASSWORD,
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|bothUserId`,
    });
    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|bothUserId`,
      password: await bcryptjs.hash("Password1!", 10),
      algorithm: "bcrypt",
    });
  }

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
  const email = withPassword ? "both@example.com" : "foo@example.com";
  const loginSession = await env.data.loginSessions.get("tenantId", state);
  await env.data.loginSessions.update("tenantId", state, {
    authParams: { ...loginSession!.authParams, username: email },
  });

  return { ...server, state, email };
}

async function getScreen(
  u2App: any,
  env: any,
  screenId: string,
  state: string,
): Promise<ScreenJson> {
  const response = await u2App.request(
    `/screen/${screenId}?state=${encodeURIComponent(state)}`,
    { method: "GET", headers: { Accept: "application/json" } },
    env,
  );
  expect(response.status).toBe(200);
  return response.json();
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

function componentIds(json: ScreenJson) {
  return json.screen.components.map((c) => c.id);
}

describe("u2 login method switch (identifier-first)", () => {
  it("offers 'log in with a code' on the password screen and sends a code", async () => {
    const { u2App, env, state, email, getSentEmails } = await setup({
      identifierFirst: true,
    });

    const passwordScreen = await getScreen(u2App, env, "enter-password", state);
    const sendCode = passwordScreen.screen.components.find(
      (c) => c.id === "send-code",
    );
    expect(sendCode?.type).toBe("NEXT_BUTTON");
    expect(sendCode?.config).toMatchObject({
      variant: "secondary",
      skip_validation: true,
    });
    expect(componentIds(passwordScreen)).toContain("divider");

    const result = await postScreen(u2App, env, "enter-password", state, {
      password: "",
      "send-code": "true",
    });

    expect(result.screen.name).toBe("email-otp-challenge");
    const sent = getSentEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(email);
  });

  it("offers 'log in with password' on the code screen", async () => {
    const { u2App, env, state } = await setup({ identifierFirst: true });

    const codeScreen = await getScreen(
      u2App,
      env,
      "email-otp-challenge",
      state,
    );
    expect(componentIds(codeScreen)).toContain("use-password");

    const result = await postScreen(u2App, env, "email-otp-challenge", state, {
      code: "",
      "use-password": "true",
    });
    expect(result.screen.name).toBe("enter-password");
  });

  it("hides 'log in with password' when the user has no password", async () => {
    const { u2App, env, state } = await setup({
      identifierFirst: true,
      withPassword: false,
    });

    const codeScreen = await getScreen(
      u2App,
      env,
      "email-otp-challenge",
      state,
    );
    expect(componentIds(codeScreen)).not.toContain("use-password");
  });
});

describe("u2 login method switch (enumeration-safe)", () => {
  it("offers 'log in with password' without revealing whether a password exists", async () => {
    const { u2App, env, state } = await setup({
      identifierFirst: true,
      withPassword: false,
    });
    await env.data.clients.update("tenantId", "clientId", {
      hide_sign_up_disabled_error: true,
    });

    const codeScreen = await getScreen(
      u2App,
      env,
      "email-otp-challenge",
      state,
    );
    expect(componentIds(codeScreen)).toContain("use-password");

    const result = await postScreen(u2App, env, "email-otp-challenge", state, {
      "use-password": "true",
    });
    expect(result.screen.name).toBe("enter-password");
  });
});

describe("u2 login method switch (combined login page)", () => {
  it("does not offer a switch on either challenge screen", async () => {
    const { u2App, env, state, getSentEmails } = await setup({
      identifierFirst: false,
    });

    const passwordScreen = await getScreen(u2App, env, "enter-password", state);
    expect(componentIds(passwordScreen)).not.toContain("send-code");

    const codeScreen = await getScreen(
      u2App,
      env,
      "email-otp-challenge",
      state,
    );
    expect(componentIds(codeScreen)).not.toContain("use-password");

    // A forged switch submission falls back to the password screen
    const result = await postScreen(u2App, env, "enter-password", state, {
      "send-code": "true",
    });
    expect(result.screen.name).toBe("enter-password");
    expect(getSentEmails()).toHaveLength(0);
  });
});
