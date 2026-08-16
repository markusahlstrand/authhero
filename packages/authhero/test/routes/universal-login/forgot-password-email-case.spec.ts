import { describe, it, expect } from "vitest";
import {
  AuthorizationResponseType,
  Strategy,
} from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { getUsernamePasswordUser } from "../../../src/utils/username-password-provider";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

/**
 * The u2 forgot-password screen lazily creates a native database user when the
 * submitted address has no account yet (so the emailed reset link has a user to
 * update). It therefore has to normalize the address the same way the
 * identifier / login / signup screens do — otherwise a mixed-case entry both
 * misses an existing account and persists the mixed case onto the new row.
 */
describe("u2 forgot-password email casing", () => {
  async function startLoginSession(env: any) {
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 600000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
        state: "state",
        nonce: "nonce",
      },
    });
    return loginSession;
  }

  async function submitForgotPassword(
    u2App: any,
    env: any,
    state: string,
    email: string,
  ) {
    return u2App.request(
      `/screen/forgot-password?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email }).toString(),
      },
      env,
    );
  }

  it("stores a lowercase email on the lazily-created user", async () => {
    const { u2App, env } = await getTestServer({ mockEmail: true });
    const loginSession = await startLoginSession(env);

    const response = await submitForgotPassword(
      u2App,
      env,
      loginSession.id,
      "Mixed.Case@Example.COM",
    );
    expect(response.status).toBe(200);

    const created = await getUsernamePasswordUser({
      env,
      tenant_id: "tenantId",
      username: "mixed.case@example.com",
    });

    expect(created).not.toBeNull();
    expect(created?.email).toBe("mixed.case@example.com");
  });

  it("reuses the existing account instead of creating a mixed-case duplicate", async () => {
    const { u2App, env } = await getTestServer({ mockEmail: true });
    const loginSession = await startLoginSession(env);

    // The account already exists, stored lowercase as every other write path
    // produces it.
    const existing = await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|existing-lowercase`,
      email: "existing@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    const response = await submitForgotPassword(
      u2App,
      env,
      loginSession.id,
      "Existing@Example.COM",
    );
    expect(response.status).toBe(200);

    // No second row for the same address under a different casing.
    const { users } = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const matching = users.filter(
      (u: { email?: string }) =>
        u.email?.toLowerCase() === "existing@example.com",
    );
    expect(matching).toHaveLength(1);
    expect(matching[0].email).toBe("existing@example.com");
    expect(matching[0].user_id).toBe(existing.user_id);
  });

  it("records the normalized address on the login session", async () => {
    const { u2App, env } = await getTestServer({ mockEmail: true });
    const loginSession = await startLoginSession(env);

    await submitForgotPassword(
      u2App,
      env,
      loginSession.id,
      "Session.Case@Example.COM",
    );

    // Subsequent screens (reset-password-code, and its resend, which calls
    // requestPasswordReset again) read the address back from here.
    const updated = await env.data.loginSessions.get(
      "tenantId",
      loginSession.id,
    );
    expect(updated?.authParams.username).toBe("session.case@example.com");
  });
});
