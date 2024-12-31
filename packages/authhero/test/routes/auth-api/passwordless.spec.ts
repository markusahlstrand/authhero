import { describe, expect, it } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";

describe("passwordless", async () => {
  it("should login using a passwordless code", async () => {
    const { oauthApp, managementApp, env, getSentEmails } = await getTestServer(
      {
        testTenantLanguage: "en",
      },
    );
    const oauthClient = testClient(oauthApp, env);
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    // Add the mock client
    await managementClient.email.providers.$post(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: {
          name: "mock-email",
          credentials: {
            api_key: "apiKey",
          },
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    // --------------------------------
    // start universal auth session where response_type is code
    // --------------------------------
    const response = await oauthClient.passwordless.start.$post({
      json: {
        client_id: "clientId",
        connection: "email",
        email: "foo@example.com",
        send: "code",
        authParams: {},
      },
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe("OK");

    const emails = await getSentEmails();
    expect(emails.length).toBe(1);
    const code = emails[0]?.data.code;
    if (!code) {
      throw new Error("No code found in email");
    }

    // --------------------------------
    // login using the code
    // --------------------------------
    const loginResponse = await oauthClient.passwordless.verify_redirect.$get({
      query: {
        response_type: AuthorizationResponseType.CODE,
        redirect_uri: "https://example.com/callback",
        client_id: "clientId",
        email: "foo@example.com",
        verification_code: code,
        connection: "email",
        state: "state",
        scope: "openid",
        audience: "https://example.com",
      },
    });

    expect(loginResponse.status).toBe(302);
    const location = loginResponse.headers.get("location");
    if (!location) {
      throw new Error("No location header found");
    }
    const redirectUrl = new URL(location);
    expect(redirectUrl.pathname).toBe("/callback");
    expect(redirectUrl.searchParams.get("code")).toBeTruthy();
  });
});