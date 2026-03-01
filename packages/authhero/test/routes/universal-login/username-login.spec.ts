import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import bcryptjs from "bcryptjs";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

/**
 * Helper to start an OAuth authorize flow and return the state parameter
 */
async function startAuthorizeFlow(
  oauthClient: ReturnType<typeof testClient>,
) {
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
  expect(authorizeResponse.status).toBe(302);

  const location = authorizeResponse.headers.get("location");
  const universalUrl = new URL(`https://example.com${location}`);
  const state = universalUrl.searchParams.get("state");
  if (!state) throw new Error("No state found");
  return state;
}

/**
 * Helper to set up the password connection with username identifier enabled
 * and the correct strategy ("Username-Password-Authentication") that the
 * screen code expects.
 */
async function setupUsernameConnection(
  env: any,
  options: {
    usernameIdentifierActive?: boolean;
    validation?: { min_length?: number; max_length?: number };
  } = {},
) {
  // The test server creates the connection with the username-password strategy,
  // but the screen code checks for strategy === "Username-Password-Authentication".
  // Update both strategy and options.
  const usernameActive = options.usernameIdentifierActive ?? true;
  await env.data.connections.update(
    "tenantId",
    "Username-Password-Authentication",
    {
      strategy: "Username-Password-Authentication",
      options: {
        attributes: {
          email: {
            identifier: { active: true },
          },
          username: {
            identifier: { active: usernameActive },
            ...(options.validation
              ? { validation: options.validation }
              : {}),
          },
        },
      },
    },
  );
}

describe("username login - identifier-first flow (u/login/identifier)", () => {
  it("should show 'Email address or Username' placeholder when username identifier is active", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 1, max_length: 15 },
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const state = await startAuthorizeFlow(oauthClient);

    const identifierPage = await universalClient.login.identifier.$get({
      query: { state },
    });
    expect(identifierPage.status).toBe(200);

    const html = await identifierPage.text();
    // The placeholder should reflect username support
    expect(html).toContain("Email address or Username");
  });

  it("should allow login with a username when username identifier is active", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 1, max_length: 15 },
    });

    // Create a password user with a username
    await env.data.users.create("tenantId", {
      email: "usernameuser@example.com",
      email_verified: true,
      name: "Username User",
      nickname: "usernameuser",
      username: "johndoe",
      picture: "https://example.com/test.png",
      connection: "Username-Password-Authentication",
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|usernameUserId`,
    });

    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|usernameUserId`,
      password: await bcryptjs.hash("Password1!", 10),
      algorithm: "bcrypt",
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const state = await startAuthorizeFlow(oauthClient);

    // Submit username (not email) to the identifier screen
    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "johndoe" },
    });

    // Should redirect to enter-password since this is a password user
    expect(identifierResponse.status).toBe(302);
    const location = identifierResponse.headers.get("location");
    expect(location).toContain("/u/enter-password");

    // Enter password
    const passwordResponse = await universalClient["enter-password"].$post({
      query: { state },
      form: { password: "Password1!" },
    });

    expect(passwordResponse.status).toBe(302);
    const redirectUri = new URL(
      passwordResponse.headers.get("location")!,
    );
    expect(redirectUri.pathname).toEqual("/callback");
    expect(redirectUri.searchParams.get("code")).toBeTypeOf("string");
  });

  it("should reject username login when username identifier is not active", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    // Update strategy to match screen code expectations, but keep username identifier inactive
    await env.data.connections.update(
      "tenantId",
      "Username-Password-Authentication",
      { strategy: "Username-Password-Authentication" },
    );

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const state = await startAuthorizeFlow(oauthClient);

    // Submit a plain username (not email) to the identifier screen
    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "johndoe" },
    });

    // Should be rejected with 400
    expect(identifierResponse.status).toBe(400);
    const html = await identifierResponse.text();
    expect(html).toContain("Invalid identifier");
  });

  it("should validate username min length", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    // Set min username length to 3
    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 3, max_length: 15 },
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const state = await startAuthorizeFlow(oauthClient);

    // Submit a username that's too short
    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "ab" },
    });

    expect(identifierResponse.status).toBe(400);
    const html = await identifierResponse.text();
    expect(html).toContain("at least 3 characters");
  });

  it("should validate username max length", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    // Set max username length to 10
    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 1, max_length: 10 },
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const state = await startAuthorizeFlow(oauthClient);

    // Submit a username that's too long
    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "verylongusername" },
    });

    expect(identifierResponse.status).toBe(400);
    const html = await identifierResponse.text();
    expect(html).toContain("at most 10 characters");
  });

  it("should still allow email login when username identifier is active", async () => {
    const { universalApp, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    // Enable username identifier
    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 1, max_length: 15 },
    });

    // Create a password user
    await env.data.users.create("tenantId", {
      email: "emailuser@example.com",
      email_verified: true,
      name: "Email User",
      nickname: "emailuser",
      picture: "https://example.com/test.png",
      connection: "Username-Password-Authentication",
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|emailUserId`,
    });

    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|emailUserId`,
      password: await bcryptjs.hash("Password1!", 10),
      algorithm: "bcrypt",
    });

    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);

    const state = await startAuthorizeFlow(oauthClient);

    // Submit email (not username) - should still work
    const identifierResponse = await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "emailuser@example.com" },
    });

    // Email identifiers go through enter-code by default (email strategy)
    expect(identifierResponse.status).toBe(302);
    const location = identifierResponse.headers.get("location");
    expect(location).toContain("/u/enter-code");
  });
});

describe("username login - combined login flow (u2/login)", () => {
  it("should show 'Email address or Username' placeholder in u2 login screen", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 1, max_length: 15 },
    });

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    const state = await startAuthorizeFlow(oauthClient);

    const loginPage = await u2Client.login.$get({
      query: { state },
    });
    expect(loginPage.status).toBe(200);

    const html = await loginPage.text();
    // Should contain the email or username placeholder (HTML-encoded)
    expect(html).toContain("Email address or Username");
  });

  it("should allow login with username + password on u2 combined login screen", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 1, max_length: 15 },
    });

    // Create a password user with a username
    await env.data.users.create("tenantId", {
      email: "u2user@example.com",
      email_verified: true,
      name: "U2 User",
      nickname: "u2user",
      username: "janedoe",
      picture: "https://example.com/test.png",
      connection: "Username-Password-Authentication",
      provider: USERNAME_PASSWORD_PROVIDER,
      is_social: false,
      user_id: `${USERNAME_PASSWORD_PROVIDER}|u2UserId`,
    });

    await env.data.passwords.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|u2UserId`,
      password: await bcryptjs.hash("Password1!", 10),
      algorithm: "bcrypt",
    });

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    const state = await startAuthorizeFlow(oauthClient);

    // POST username + password to the u2 login HTML form route
    const loginResponse = await u2Client.login.$post({
      query: { state },
      form: { username: "janedoe", password: "Password1!" },
    });

    // Should redirect to the callback
    expect(loginResponse.status).toBe(302);
    const redirectUri = new URL(loginResponse.headers.get("location")!);
    expect(redirectUri.pathname).toEqual("/callback");
    expect(redirectUri.searchParams.get("code")).toBeTypeOf("string");
  });

  it("should reject username on u2 login when username identifier is not active", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    // Update strategy to match screen code but keep username identifier inactive
    await env.data.connections.update(
      "tenantId",
      "Username-Password-Authentication",
      { strategy: "Username-Password-Authentication" },
    );

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    const state = await startAuthorizeFlow(oauthClient);

    // POST username + password - should be rejected since username identifier is not active
    const loginResponse = await u2Client.login.$post({
      query: { state },
      form: { username: "johndoe", password: "Password1!" },
    });

    // Should re-render with error (not redirect)
    expect(loginResponse.status).toBe(200);
    const html = await loginResponse.text();
    expect(html).toContain("Invalid email");
  });

  it("should validate username length on u2 login screen", async () => {
    const { u2App, oauthApp, env } = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });

    // Set min=3, max=10
    await setupUsernameConnection(env, {
      usernameIdentifierActive: true,
      validation: { min_length: 3, max_length: 10 },
    });

    const oauthClient = testClient(oauthApp, env);
    const u2Client = testClient(u2App, env);

    const state = await startAuthorizeFlow(oauthClient);

    // Username too short
    const shortResponse = await u2Client.login.$post({
      query: { state },
      form: { username: "ab", password: "Password1!" },
    });

    expect(shortResponse.status).toBe(200);
    const shortHtml = await shortResponse.text();
    expect(shortHtml).toContain("at least 3 characters");
  });
});
