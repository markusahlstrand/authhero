import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import {
  AuthorizationResponseMode,
  AuthorizationResponseType,
} from "@authhero/adapter-interfaces";

describe("authorize", () => {
  it("should return a 403 if the origin isn't valid", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com",
          state: "state",
        },
      },
      {
        headers: {
          origin: "https://invalid.org",
        },
      },
    );

    expect(response.status).toEqual(403);
    const responseText = await response.text();
    expect(responseText).toEqual("Origin https://invalid.org not allowed");
  });

  it("should return a redirect to the universal login", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          ui_locales: "en",
          scope: "openid email profile",
          // This is a temporary workaround until we have a better way to handle this
          vendor_id: "vendorId",
          response_mode: AuthorizationResponseMode.QUERY,
          response_type: AuthorizationResponseType.CODE,
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
    const redirectUri = new URL("https://example.com" + location);

    // Validate the redirect uri
    expect(redirectUri.pathname).toEqual("/u/enter-email");

    // Fetch the login session
    const login = await env.data.logins.get(
      "clientId",
      redirectUri.searchParams.get("state")!,
    );

    expect(login?.authParams).toEqual({
      client_id: "clientId",
      redirect_uri: "https://example.com/callback",
      response_type: AuthorizationResponseType.CODE,
      response_mode: AuthorizationResponseMode.QUERY,
      scope: "openid email profile",
      vendor_id: "vendorId",
      state: "state",
      ui_locales: "en",
    });
  });
});
