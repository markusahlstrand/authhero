import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../helpers/test-server";
import { parseJWT } from "oslo/jwt";
import {
  HookEvent,
  OnExecuteCredentialsExchangeAPI,
} from "../../src/types/Hooks";

describe("client-credentials-hooks", () => {
  it("should add a claim for a client", async () => {
    const { oauthApp, env } = await getTestServer();
    const client = testClient(oauthApp, env);

    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        api: OnExecuteCredentialsExchangeAPI,
      ) => {
        if (event.client?.client_id === "clientId") {
          api.accessToken.setCustomClaim("foo", "bar");
        }
      },
    };

    const response = await client.oauth.token.$post(
      {
        form: {
          grant_type: "client_credentials",
          client_id: "clientId",
          client_secret: "clientSecret",
          audience: "https://example.com",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { access_token: string };

    const accessToken = parseJWT(body.access_token);
    expect(accessToken?.payload).toMatchObject({
      sub: "clientId",
      iss: "http://localhost:3000/",
      aud: "https://example.com",
      foo: "bar",
    });
  });

  it("should include connection info in the event for user-based flows", async () => {
    const { oauthApp, env, getSentEmails } = await getTestServer({
      testTenantLanguage: "en",
    });
    const oauthClient = testClient(oauthApp, env);

    let capturedEvent: HookEvent | undefined;

    env.hooks = {
      onExecuteCredentialsExchange: async (
        event: HookEvent,
        _api: OnExecuteCredentialsExchangeAPI,
      ) => {
        capturedEvent = event;
      },
    };

    // Start passwordless flow to get a code
    const startResponse = await oauthClient.passwordless.start.$post(
      {
        json: {
          client_id: "clientId",
          connection: "email",
          email: "foo@example.com",
          send: "code",
          authParams: {},
        },
      },
      {
        headers: {
          "x-real-ip": "1.2.3.4",
          "user-agent": "Mozilla/5.0",
        },
      },
    );
    expect(startResponse.status).toBe(200);

    const emails = getSentEmails();
    const code = emails[0]?.data.code;
    expect(code).toBeTruthy();

    // Exchange the OTP for tokens - this triggers createAuthTokens with a user
    const tokenResponse = await oauthClient.oauth.token.$post(
      {
        form: {
          grant_type: "http://auth0.com/oauth/grant-type/passwordless/otp",
          otp: code,
          client_id: "clientId",
          realm: "email",
          username: "foo@example.com",
        },
      },
      {
        headers: {
          "tenant-id": "tenantId",
        },
      },
    );

    expect(tokenResponse.status).toBe(200);
    expect(capturedEvent).toBeDefined();
    expect(capturedEvent!.connection).toMatchObject({
      id: "email",
      name: "Email",
      strategy: "email",
    });
  });
});
