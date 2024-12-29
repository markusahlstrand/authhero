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
    const loginSession = await env.data.logins.get(
      "tenantId",
      ouath2Code.login_id,
    );
    expect(loginSession).toMatchObject({
      login_id: ouath2Code.login_id,
      authParams: {
        redirect_uri: "https://example.com/callback",
        state: "state",
        client_id: "clientId",
      },
    });
  });
});
