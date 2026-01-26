import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

describe("sms", () => {
  it("should login using a sms", async () => {
    const { universalApp, oauthApp, managementApp, env, getSentSms } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);

    // Add a sms connection
    const token = await getAdminToken();

    // Add SMS connection
    await managementClient.connections.$post(
      {
        header: {
          "tenant-id": "tenantId",
        },
        json: {
          name: "sms",
          strategy: "sms",
          options: {
            provider: "twilio",
            from: "+1234567890",
            twilio_sid: "mock_account_sid",
            twilio_token: "mock_auth_token",
          },
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });

    expect(authorizeResponse.status).toBe(302);

    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) {
      throw new Error("No state found");
    }

    // --------------------------------
    // enter phone number without country code
    // --------------------------------
    const enterEmailGetResponseWithoutCountryCode =
      await universalClient.login.identifier.$get({
        query: { state },
      });
    expect(enterEmailGetResponseWithoutCountryCode.status).toBe(200);

    const enterEmailPostResponseWithoutCountryCode =
      await universalClient.login.identifier.$post(
        {
          query: { state },
          form: { username: "0707123456" },
        },
        {
          headers: {
            "cf-ipcountry": "SE",
          },
        },
      );
    expect(enterEmailPostResponseWithoutCountryCode.status).toBe(302);

    let sentSms = getSentSms();
    expect(sentSms.length).toBe(1);

    const codeSmsWithoutCountryCode = sentSms[0];
    expect(codeSmsWithoutCountryCode.to).toBe("+46707123456");

    // --------------------------------
    // enter phone number
    // --------------------------------
    const enterEmailGetResponse = await universalClient.login.identifier.$get({
      query: { state },
    });
    expect(enterEmailGetResponse.status).toBe(200);

    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "+46707222222" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    sentSms = getSentSms();
    expect(sentSms.length).toBe(2);

    const codeSms = sentSms[1];
    expect(codeSms.to).toBe("+46707222222");

    // --------------------------------
    // enter correct code
    // --------------------------------
    const { code } = codeSms.data;

    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });

    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");
    if (!enterCodeLocation) {
      throw new Error("No location header found");
    }

    // --------------------------------
    // check created user
    // --------------------------------

    const usersListResponse = await managementClient.users.$get(
      {
        header: {
          "tenant-id": "tenantId",
        },
        query: {
          q: "+46707222222",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    const users = await usersListResponse.json();

    expect(users.length).toBe(1);
    expect(users[0].connection).toBe("sms");
  });
});
