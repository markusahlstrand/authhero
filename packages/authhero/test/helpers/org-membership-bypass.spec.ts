import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { completeLogin } from "../../src/authentication-flows/common";
import { Context } from "hono";
import { Bindings, Variables } from "../../src/types";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getEnrichedClient } from "../../src/helpers/client";

describe("organization membership bypass vulnerability", () => {
  it("should enforce organization membership even without audience", async () => {
    const { env } = await getTestServer();
    const ctx = {
      env,
      var: {
        tenant_id: "tenantId",
        custom_domain: undefined,
        ip: "127.0.0.1",
        useragent: "test",
        host: "test.auth0.com",
      },
      req: {
        method: "POST",
        url: "https://test.auth0.com/oauth/token",
      },
    } as Context<{
      Bindings: Bindings;
      Variables: Variables;
    }>;

    // Get the test server's default client and user
    const client = await getEnrichedClient(env, "clientId");
    const user = await env.data.users.get("tenantId", "email|userId");

    if (!client || !user) {
      throw new Error("Test setup failed: default client or user not found");
    }

    // Create an organization but DON'T make the user a member
    const organization = await env.data.organizations.create("tenantId", {
      name: "Test Organization",
      display_name: "Test Organization",
    });

    // Request token WITHOUT audience but WITH organization parameter
    await expect(
      completeLogin(ctx, {
        authParams: {
          client_id: client.client_id,
          // NO audience - this previously bypassed organization membership validation
          scope: "openid profile",
          response_type: AuthorizationResponseType.TOKEN,
        },
        client,
        user,
        organization: {
          id: organization.id,
          name: organization.name,
        }, // User trying to forge org membership
        responseType: AuthorizationResponseType.TOKEN,
      }),
    ).rejects.toThrow("User is not a member of the specified organization");
  });
});
