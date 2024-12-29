import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { testClient } from "hono/testing";
import { nanoid } from "nanoid";
import { generateCodeVerifier } from "oslo/oauth2";

describe("ticket", () => {
  it("should return a auth response for a valid ticket", async () => {
    const { oauthApp, env } = await getTestServer();
    const oauthClient = testClient(oauthApp, env);

    const loginSession = await env.data.logins.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
      authParams: {
        client_id: "clientId",
        username: "foo@example.com",
        redirect_uri: "https://example.com/callback",
      },
    });

    const co_id = nanoid(12);
    const co_verifier = generateCodeVerifier();

    const ticket = await env.data.codes.create("tenantId", {
      code_id: "ticket",
      code_type: "ticket",
      login_id: loginSession.login_id,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      code_verifier: [co_id, co_verifier].join("|"),
    });

    const response = await oauthClient.authorize.$get(
      {
        query: {
          client_id: "clientId",
          redirect_uri: "https://example.com/callback",
          state: "state",
          login_ticket: ticket.code_id,
          realm: "email",
        },
      },
      {
        headers: {
          origin: "https://example.com",
        },
      },
    );

    expect(response.status).toEqual(302);
  });
});
