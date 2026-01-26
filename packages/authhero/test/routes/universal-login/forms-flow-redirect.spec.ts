import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

// This test covers FLOW node with REDIRECT action after a STEP node

describe("forms - FLOW node with REDIRECT after STEP", () => {
  it("should execute FLOW redirect action after submitting a STEP node", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // First, create a flow with a REDIRECT action
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "change-email-flow",
          actions: [
            {
              id: "redirect_action_1",
              type: "REDIRECT",
              action: "REDIRECT_USER",
              params: {
                target: "change-email",
              },
            },
          ],
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFlowResponse.status).toBe(201);
    const flow = await createFlowResponse.json();
    expect(flow.id).toBeTruthy();

    // Create a form with a STEP node that transitions to a FLOW node
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "form-with-flow-redirect",
          nodes: [
            {
              id: "step_consent",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Consent Step",
              config: {
                components: [
                  {
                    id: "info-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Action Required</h2><p>Continue to update your email.</p>",
                    },
                  },
                  {
                    id: "continue-btn",
                    type: "NEXT_BUTTON",
                    config: {
                      text: "Continue",
                    },
                  },
                ],
                next_node: "flow_redirect",
              },
            },
            {
              id: "flow_redirect",
              type: "FLOW",
              coordinates: { x: 300, y: 100 },
              alias: "Redirect Flow",
              config: {
                flow_id: flow.id,
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "step_consent" },
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

    // Simulate login to trigger the form
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
    if (!state) throw new Error("No state found");

    // Login with email code flow
    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "test-flow@example.com" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    // Enter the verification code
    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");

    // Should redirect to the form step
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step_consent?state=${state}`,
    );

    // Now access the form step
    const formStepGet = await universalClient["forms"][form.id][
      "nodes"
    ].step_consent.$get({
      query: { state },
    });
    expect(formStepGet.status).toBe(200);
    const html = await formStepGet.text();
    expect(html).toContain("Action Required");
    expect(html).toContain("Continue to update your email");

    // Submit the form (no LEGAL fields, so no required fields)
    const formStepPost = await universalClient["forms"][form.id][
      "nodes"
    ].step_consent.$post({
      query: { state },
      form: {},
    });
    expect(formStepPost.status).toBe(302);
    const postLocation = formStepPost.headers.get("location");

    // Should redirect to the change-email page (from the FLOW redirect action)
    expect(postLocation).toBe(`/u/account/change-email?state=${state}`);

    // Verify that the login session is properly set to awaiting_continuation state
    // This ensures the user can access the change-email page and return to the auth flow
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession).toBeTruthy();
    expect(loginSession?.state).toBe("awaiting_continuation");

    // Verify the continuation data is properly set
    expect(loginSession?.state_data).toBeTruthy();
    const stateData = JSON.parse(loginSession!.state_data!);
    expect(stateData.continuationScope).toEqual(["change-email"]);
    expect(stateData.continuationReturnUrl).toBe(
      `/u/continue?state=${encodeURIComponent(state)}`,
    );
  });

  it("should complete the login flow after /u/continue is called", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a flow with a REDIRECT action to change-email
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "change-email-flow-continue",
          actions: [
            {
              id: "redirect_action_continue",
              type: "REDIRECT",
              action: "REDIRECT_USER",
              params: {
                target: "change-email",
              },
            },
          ],
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFlowResponse.status).toBe(201);
    const flow = await createFlowResponse.json();

    // Create a form with a STEP node that transitions to a FLOW node
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "form-continue-test",
          nodes: [
            {
              id: "step_continue",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Continue Step",
              config: {
                components: [
                  {
                    id: "info-text",
                    type: "RICH_TEXT",
                    config: {
                      content: "<h2>Continue Test</h2>",
                    },
                  },
                  {
                    id: "continue-btn",
                    type: "NEXT_BUTTON",
                    config: {
                      text: "Continue",
                    },
                  },
                ],
                next_node: "flow_redirect_continue",
              },
            },
            {
              id: "flow_redirect_continue",
              type: "FLOW",
              coordinates: { x: 300, y: 100 },
              alias: "Redirect Flow",
              config: {
                flow_id: flow.id,
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "step_continue" },
          ending: {},
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFormResponse.status).toBe(201);
    const form = await createFormResponse.json();

    // Register the form on a post-login hook
    await managementClient.hooks.$post(
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

    // Simulate login to trigger the form
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "continue-test-state",
        nonce: "continue-test-nonce",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    // Login with email code flow
    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "test-continue@example.com" },
    });

    // Enter the verification code
    const email = getSentEmails()[0];
    const { code } = email.data;
    await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });

    // Submit the form step to trigger the FLOW redirect
    const formStepPost = await universalClient["forms"][form.id][
      "nodes"
    ].step_continue.$post({
      query: { state },
      form: {},
    });
    expect(formStepPost.status).toBe(302);

    // Verify session is in awaiting_continuation state
    const loginSessionBefore = await env.data.loginSessions.get(
      "tenantId",
      state,
    );
    expect(loginSessionBefore?.state).toBe("awaiting_continuation");

    // Now call the /u/continue endpoint to complete the flow
    const continueResponse = await universalClient.continue.$get({
      query: { state },
    });
    expect(continueResponse.status).toBe(302);

    // Should redirect to the client's redirect_uri with auth code
    const continueLocation = continueResponse.headers.get("location");
    expect(continueLocation).toBeTruthy();
    expect(continueLocation).toContain("https://example.com/callback");
    expect(continueLocation).toContain("code=");

    // Verify the login session state has been updated
    const loginSessionAfter = await env.data.loginSessions.get(
      "tenantId",
      state,
    );
    // Should transition to completed after front channel auth response
    expect(loginSessionAfter?.state).toBe("completed");
  });

  it("should execute FLOW redirect to account page after STEP", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a flow with a REDIRECT action to account page
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "account-flow",
          actions: [
            {
              id: "redirect_account_1",
              type: "REDIRECT",
              action: "REDIRECT_USER",
              params: {
                target: "account",
              },
            },
          ],
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFlowResponse.status).toBe(201);
    const flow = await createFlowResponse.json();

    // Create a form with STEP -> FLOW
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "form-account-redirect",
          nodes: [
            {
              id: "step_info",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Info Step",
              config: {
                components: [
                  {
                    id: "text",
                    type: "RICH_TEXT",
                    config: {
                      content: "<p>Click continue to manage your account.</p>",
                    },
                  },
                  {
                    id: "btn",
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "flow_account",
              },
            },
            {
              id: "flow_account",
              type: "FLOW",
              coordinates: { x: 300, y: 100 },
              config: {
                flow_id: flow.id,
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "step_info" },
          ending: {},
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFormResponse.status).toBe(201);
    const form = await createFormResponse.json();

    // Register the form on a post-login hook
    await managementClient.hooks.$post(
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

    // Login flow
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state2",
        nonce: "nonce2",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const universalUrl = new URL(
      `https://example.com${authorizeResponse.headers.get("location")}`,
    );
    const state = universalUrl.searchParams.get("state")!;

    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "test-account@example.com" },
    });

    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });

    // Should be directed to the form step
    const enterCodeLocation = enterCodePostResponse.headers.get("location");
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step_info?state=${state}`,
    );

    // Submit the form
    const formStepPost = await universalClient["forms"][form.id][
      "nodes"
    ].step_info.$post({
      query: { state },
      form: {},
    });
    expect(formStepPost.status).toBe(302);
    const postLocation = formStepPost.headers.get("location");

    // Should redirect to the account page (from the FLOW redirect action)
    expect(postLocation).toBe(`/u/account?state=${state}`);

    // Verify that the login session is properly set to awaiting_continuation state
    // This ensures the user can access the account page and return to the auth flow
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    expect(loginSession).toBeTruthy();
    expect(loginSession?.state).toBe("awaiting_continuation");

    // Verify the continuation data is properly set
    expect(loginSession?.state_data).toBeTruthy();
    const stateData = JSON.parse(loginSession!.state_data!);
    expect(stateData.continuationScope).toEqual(["account"]);
    expect(stateData.continuationReturnUrl).toBe(
      `/u/continue?state=${encodeURIComponent(state)}`,
    );
  });
});
