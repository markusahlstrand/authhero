import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { testClient } from "hono/testing";
import { nanoid } from "nanoid";
import { LogTypes } from "@authhero/adapter-interfaces";
import bcryptjs from "bcryptjs";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

describe("linked user login logging", () => {
  it("should log with database strategy when user logs in with email/password even if linked to social primary", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create a social user (primary)
    const primaryUserId = `google-oauth2|${nanoid()}`;
    const primaryUser = await env.data.users.create("tenantId", {
      user_id: primaryUserId,
      email: "test@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create an auth2 user (secondary) linked to the social user
    const linkedUserId = `${USERNAME_PASSWORD_PROVIDER}|${nanoid()}`;
    const linkedUser = await env.data.users.create("tenantId", {
      user_id: linkedUserId,
      email: "test@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_to: primaryUserId, // Link to primary user
    });

    // Create password for the auth2 user
    await env.data.passwords.create("tenantId", {
      user_id: linkedUserId,
      password: await bcryptjs.hash("Test1234!", 10),
    });

    // Create login session - not needed for /co/authenticate
    // const loginSession = await env.data.loginSessions.create("tenantId", {
    //   expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    //   authParams: {
    //     client_id: "clientId",
    //     redirect_uri: "https://example.com/callback",
    //   },
    // });

    // Attempt login with email and password
    const response = await oauthClient.co.authenticate.$post({
      json: {
        credential_type: "http://auth0.com/oauth/grant-type/password-realm",
        username: "test@example.com",
        password: "Test1234!",
        realm: "Username-Password-Authentication",
        client_id: "clientId",
      },
    });

    expect(response.status).toBe(200);

    // Check the log
    const { logs } = await env.data.logs.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: true,
    });

    const successLog = logs.find((log) => log.type === LogTypes.SUCCESS_LOGIN);
    expect(successLog).toBeDefined();

    // Should log the primary user's ID
    expect(successLog!.user_id).toBe(primaryUserId);

    // CRITICAL: Should log the actual authentication method used, not the primary user's type
    expect(successLog!.strategy_type).toBe("database");

    // Should log the actual connection used for login
    expect(successLog!.connection).toBe("Username-Password-Authentication");
  });

  // TODO: Add test for social login with linked accounts
  // This would require mocking the OAuth provider callback flow
});
