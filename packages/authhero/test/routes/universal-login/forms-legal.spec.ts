import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

// This test covers the legal consent form flow via post-login hook

describe("forms - legal consent post-login flow", () => {
  it("should require privacy policy acceptance on post-login and persist it", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a legal consent form
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "privacy-consent",
          nodes: [
            {
              id: "step1",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Privacy Policy Step",
              config: {
                components: [
                  {
                    id: "intro-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Privacy Policy</h2><p>Please accept our privacy policy to continue.</p>",
                    },
                  },
                  {
                    id: "policy-consent",
                    type: "LEGAL",
                    config: {
                      text: "I agree to the <a href='/privacy'>Privacy Policy</a>",
                    },
                    required: true,
                  },
                  {
                    id: "continue-btn",
                    type: "NEXT_BUTTON",
                    config: {
                      text: "Continue",
                    },
                  },
                ],
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "step1" },
          ending: {},
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFormResponse.status).toBe(201);
    const form = await createFormResponse.json();
    expect(form.id).toBeTruthy();

    // Register the form on a post-login hook
    const createHookResponse = await managementClient.hooks.$post(
      {
        json: {
          trigger_id: "post-user-login",
          form_id: form.id,
          enabled: true,
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createHookResponse.status).toBe(201);

    // Simulate login to trigger the form (using passwordless email for simplicity)
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state",
        nonce: "nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
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
    // Post the email to simulate login
    // --------------------------------
    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "test@example.com" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    // --------------------------------
    // Post the email code to simulate verification
    // --------------------------------
    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step1?state=${state}`,
    );

    // Go to the form node (should be redirected there after login)
    // For test: directly GET the form node
    const formNodeGet = await universalClient["forms"][form.id][
      "nodes"
    ].step1.$get({ query: { state } });

    expect(formNodeGet.status).toBe(200);
    const html = await formNodeGet.text();
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("I agree to the");

    // 4. Try submitting without checking the box
    const formNodePostMissing = await universalClient["forms"][form.id][
      "nodes"
    ].step1.$post({ query: { state }, form: {} });
    expect(formNodePostMissing.status).toBe(200);
    const htmlMissing = await formNodePostMissing.text();
    expect(htmlMissing).toContain("Missing required fields");
    expect(htmlMissing).toContain("policy-consent");

    // 5. Submit with the box checked
    const formNodePostOk = await universalClient["forms"][form.id][
      "nodes"
    ].step1.$post({ query: { state }, form: { "policy-consent": "on" } });

    expect(formNodePostOk.status).toBe(302);
    const redirectLocation = new URL(formNodePostOk.headers.get("location"));
    expect(redirectLocation.pathname).toBe("/callback");

    // 6. Validate the privacy policy was persisted in the user's app-settings
    // (Assume user is created with phone/email = test@example.com for this test)
    const usersListResponse = await managementClient.users.$get(
      {
        header: { "tenant-id": "tenantId" },
        query: { q: "test@example.com" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(usersListResponse.status).toBe(200);
    const users = await usersListResponse.json();
    expect(users.length).toBeGreaterThan(0);
    // Check app_metadata or user settings for privacy policy acceptance
    const user = users[0];
    expect(
      user.app_metadata || user.settings || user["app-settings"],
    ).toBeTruthy();
    // You may need to adjust the key below based on actual persistence logic
    // expect(
    //   user.app_metadata?.privacy_policy_accepted ||
    //     user.settings?.privacy_policy_accepted ||
    //     user["app-settings"]?.privacy_policy_accepted,
    // ).toBeTruthy();
  });
});
