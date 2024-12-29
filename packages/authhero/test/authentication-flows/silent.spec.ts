import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("silent", () => {
  it("should return a auth response for a valid silent auth session", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const session = await env.data.sessions.create("tenantId", {
      session_id: "sessionId",
      user_id: "email|userId",
      client_id: "clientId",
      expires_at: new Date(Date.now() + 1000).toISOString(),
      used_at: new Date().toISOString(),
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.session_id}`,
        },
      },
    );

    expect(response.status).toEqual(200);
    const htmlBody = await response.text();
    expect(htmlBody).toContain("access_token");
  });
});
