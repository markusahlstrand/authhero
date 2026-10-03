import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

async function seedSignupSession(env: TestEnv, uiLocales?: string) {
  const loginSession = await env.data.loginSessions.create("tenantId", {
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    csrf_token: "csrf",
    authParams: {
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      ...(uiLocales ? { ui_locales: uiLocales } : {}),
    },
  });
  return loginSession.id;
}

type ScreenMessage = { text: string; type: string };
type ScreenComponent = { id: string; messages?: ScreenMessage[] };
type ScreenBody = {
  screen: { messages?: ScreenMessage[]; components: ScreenComponent[] };
};

describe("u2 signup i18n", () => {
  it("shows the password mismatch error in Swedish on the full-page POST", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedSignupSession(env, "sv");

    const response = await u2App.request(
      `/signup?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: "new-user@example.com",
          password: "Password1!",
          re_password: "Password2!",
        }).toString(),
      },
      env,
    );

    const body = await response.text();
    expect(body).toContain("Lösenorden matchar inte");
    expect(body).not.toContain("Passwords don't match");
    expect(body).not.toContain("Passwords don&#39;t match");
  });

  it("shows the password mismatch error in Swedish once on the JSON screen POST", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedSignupSession(env, "sv");

    const response = await u2App.request(
      `/screen/signup?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: {
            email: "new-user@example.com",
            password: "Password1!",
            re_password: "Password2!",
          },
        }),
      },
      env,
    );

    const raw = await response.text();
    expect(raw).not.toContain("Passwords don't match");

    const json: ScreenBody = JSON.parse(raw);
    const rePassword = json.screen.components.find(
      (c) => c.id === "re_password",
    );
    expect(rePassword?.messages).toEqual([
      { text: "Lösenorden matchar inte", type: "error" },
    ]);
    // The field already shows the error, so no duplicate screen-level banner.
    expect(
      (json.screen.messages ?? []).filter((m) => m.type === "error"),
    ).toEqual([]);
  });

  it("localizes password policy errors", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedSignupSession(env, "sv");

    const response = await u2App.request(
      `/screen/signup?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: {
            email: "new-user@example.com",
            password: "short",
            re_password: "short",
          },
        }),
      },
      env,
    );

    const json: ScreenBody = JSON.parse(await response.text());
    const password = json.screen.components.find((c) => c.id === "password");
    expect(password?.messages).toEqual([
      { text: "Lösenordet måste vara minst 8 tecken", type: "error" },
    ]);
  });

  it("keeps the English copy by default", async () => {
    const { u2App, env } = await getTestServer();
    const state = await seedSignupSession(env);

    const response = await u2App.request(
      `/screen/signup?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: {
            email: "new-user@example.com",
            password: "Password1!",
            re_password: "Password2!",
          },
        }),
      },
      env,
    );

    const json: ScreenBody = JSON.parse(await response.text());
    const rePassword = json.screen.components.find(
      (c) => c.id === "re_password",
    );
    expect(rePassword?.messages).toEqual([
      { text: "Passwords don't match", type: "error" },
    ]);
  });
});
