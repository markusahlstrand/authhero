import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("connection", () => {
  it("should redirect to a connection", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    await env.data.connections.create("tenantId", {
      id: "google-oauth2",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {
        client_id: "clientId",
        client_secret: "clientSecret",
      },
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          connection: "google-oauth2",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
    const location = response.headers.get("location");
    if (!location) throw new Error("No location header");
    const redirectUri = new URL(location);
    expect(redirectUri.pathname).toEqual("/o/oauth2/v2/auth");

    const state = redirectUri.searchParams.get("state");
    if (!state) throw new Error("No state found in redirect uri");
    const ouath2Code = await env.data.codes.get(
      "tenantId",
      state,
      "oauth2_state",
    );
    if (!ouath2Code) throw new Error("No code found in redirect uri");
    expect(ouath2Code).toMatchObject({
      code_id: state,
      code_type: "oauth2_state",
    });
    const loginSession = await env.data.loginSessions.get(
      "tenantId",
      ouath2Code.login_id,
    );
    expect(loginSession).toMatchObject({
      id: ouath2Code.login_id,
      authParams: {
        redirect_uri: "https://example.com/callback",
        state: "state",
        client_id: "clientId",
      },
    });
  });

  it("persists the full upstream claim set to profileData on callback", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    // mock-strategy exposes validateAuthorizationCodeAndGetUserWithRaw, so the
    // callback should persist the entire decoded claim set (incl. upn /
    // preferred_username) to profileData — not just the normalized email.
    await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          connection: "mock-strategy",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
        },
      },
      { headers: { origin: "https://example.com" } },
    );

    // mock-strategy.getRedirect uses the fixed oauth2_state "code".
    const oauth2Code = await env.data.codes.get(
      "tenantId",
      "code",
      "oauth2_state",
    );
    if (!oauth2Code) throw new Error("No oauth2_state code found");

    const callbackResponse = await oauthClient.login.callback.$get({
      query: { state: "code", code: "entra-mismatch" },
    });
    expect(callbackResponse.status).toEqual(302);

    const user = await env.data.users.get(
      "tenantId",
      "mock-strategy|entra-oid-123",
    );
    if (!user?.profileData) throw new Error("User or profileData missing");
    const profileData = JSON.parse(user.profileData);

    // The full upstream claim set is captured...
    expect(profileData).toMatchObject({
      preferred_username: "alice@contoso.com",
      upn: "alice@contoso.com",
      unique_name: "alice@contoso.com",
      oid: "00000000-aaaa-bbbb-cccc-111111111111",
      tid: "contoso-tenant-guid",
      email: "mail-attr@contoso.com",
    });
    // ...but the upstream `sub` is not duplicated into profileData (it maps to
    // user_id).
    expect(profileData.sub).toBeUndefined();
  });
});
