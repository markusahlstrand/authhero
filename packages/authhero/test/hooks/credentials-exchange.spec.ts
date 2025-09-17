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
});
