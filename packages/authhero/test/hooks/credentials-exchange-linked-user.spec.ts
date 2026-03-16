import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../helpers/test-server";
import {
  HookEvent,
  OnExecuteCredentialsExchangeAPI,
} from "../../src/types/Hooks";
import { nanoid } from "nanoid";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { computeCodeChallenge } from "../../src/utils/crypto";
import { generateCodeVerifier } from "oslo/oauth2";

describe("credentials-exchange hook with linked users", () => {
  it("should pass the authentication connection (email), not the primary user's connection (oidc), when a linked user logs in", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // Create a social/OIDC user (primary)
    const primaryUserId = `google-oauth2|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: primaryUserId,
      email: "linked-test@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Create a password user (secondary) linked to the social user
    const linkedUserId = `${USERNAME_PASSWORD_PROVIDER}|${nanoid()}`;
    await env.data.users.create("tenantId", {
      user_id: linkedUserId,
      email: "linked-test@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      login_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      linked_to: primaryUserId,
    });

    // Create a google-oauth2 connection so the test can verify it's NOT used
    await env.data.connections.create("tenantId", {
      id: "google-oauth2",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {},
    });

    // Capture the hook event
    let capturedEvent: HookEvent | undefined;
    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        _api: OnExecuteCredentialsExchangeAPI,
      ) => {
        capturedEvent = event;
      },
    };

    // Create a login session with auth_connection set to the password connection
    // (simulating what authenticateLoginSession does after password login)
    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: nanoid(),
      authParams: {
        client_id: "clientId",
        username: "linked-test@example.com",
        redirect_uri: "https://example.com/callback",
        scope: "openid",
      },
      user_id: primaryUserId,
      auth_connection: "Username-Password-Authentication",
    });

    // Create a PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await computeCodeChallenge(codeVerifier, "S256");

    // Create an authorization code linked to the login session
    const code = await env.data.codes.create("tenantId", {
      code_id: nanoid(32),
      code_type: "authorization_code",
      login_id: loginSession.id,
      expires_at: new Date(Date.now() + 300 * 1000).toISOString(),
      user_id: primaryUserId,
      redirect_uri: "https://example.com/callback",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    // Exchange the code for tokens - this triggers createAuthTokens and the hook
    const tokenResponse = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "authorization_code",
          client_id: "clientId",
          code: code.code_id,
          redirect_uri: "https://example.com/callback",
          code_verifier: codeVerifier,
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(tokenResponse.status).toBe(200);

    // The hook should have been called
    expect(capturedEvent).toBeDefined();

    // The user in the event should be the primary user
    expect(capturedEvent!.user?.user_id).toBe(primaryUserId);

    // CRITICAL: The connection should reflect the actual authentication method
    // (Username-Password-Authentication), not the primary user's connection (google-oauth2)
    expect(capturedEvent!.connection).toBeDefined();
    expect(capturedEvent!.connection!.name).toBe(
      "Username-Password-Authentication",
    );
    expect(capturedEvent!.connection!.strategy).not.toBe("google-oauth2");
  });
});
