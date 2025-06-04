import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("silent", () => {
  it("should return a auth response for a valid silent auth session", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.TOKEN_ID_TOKEN,
      },
    });

    const session = await env.data.sessions.create("tenantId", {
      id: "sessionId",
      user_id: "email|userId",
      used_at: new Date().toISOString(),
      login_session_id: loginSession.id, // Link session to login session
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

    // ----------------------------------------
    // Get a token and id-token for the session
    // ----------------------------------------
    const accessTokenResponse = await oauthClient.authorize.$get(
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

    expect(accessTokenResponse.status).toEqual(200);
    const accessTokenhtmlBody = await accessTokenResponse.text();
    expect(accessTokenhtmlBody).toContain("access_token");

    // ----------------------------------------
    // Get a code for the session
    // ----------------------------------------
    const codeResponse = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          prompt: "none",
          response_type: AuthorizationResponseType.CODE,
        },
      },
      {
        headers: {
          origin: "https://example.com",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
    );

    expect(codeResponse.status).toEqual(200);
    const codeResponseHtmlBody = await codeResponse.text();
    expect(codeResponseHtmlBody).toContain("code");

    const codeMatch = codeResponseHtmlBody.match(/"code":"([^"]+)"/);

    const code = await env.data.codes.get(
      "tenantId",
      codeMatch?.[1] || "",
      "authorization_code",
    );
    expect(code).toBeDefined();
    expect(code?.login_id).toEqual(loginSession.id);

    // Check that the session was updated
    const updatedSession = await env.data.sessions.get("tenantId", "sessionId");
    if (!updatedSession) {
      throw new Error("Session not found");
    }

    expect(updatedSession.used_at).not.toEqual(session.used_at);
  });
});
