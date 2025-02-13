import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("silent", () => {
  it("should return a auth response for a valid silent auth session", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      device: {
        last_ip: "",
        initial_ip: "",
        last_user_agent: "",
        initial_user_agent: "",
        initial_asn: "",
        last_asn: "",
      },
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      clients: ["clientId"],
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
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(response.status).toEqual(200);
    const htmlBody = await response.text();
    expect(htmlBody).toContain("access_token");

    // Check that the session was updated
    const updatedSession = await env.data.sessions.get("tenantId", "sessionId");
    if (!updatedSession) {
      throw new Error("Session not found");
    }

    expect(updatedSession.used_at).not.toEqual(session.used_at);
  });
});
