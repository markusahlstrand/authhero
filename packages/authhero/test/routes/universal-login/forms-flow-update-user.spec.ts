import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

// This test covers FLOW node with AUTH0 UPDATE_USER action after a STEP node with form fields

describe("forms - FLOW node with AUTH0 UPDATE_USER after STEP", () => {
  it("should execute UPDATE_USER with static values after submitting a STEP node", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a flow with an AUTH0 UPDATE_USER action (static value)
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "update-gender-flow",
          actions: [
            {
              id: "update_user_1",
              type: "AUTH0",
              action: "UPDATE_USER",
              params: {
                user_id: "{{user.id}}",
                changes: {
                  "metadata.gender": "male",
                },
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

    // Create a form with a STEP node (with DROPDOWN) that transitions to a FLOW node
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "form-with-update-user",
          nodes: [
            {
              id: "step_profile",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Profile Step",
              config: {
                components: [
                  {
                    id: "rich_text_info",
                    visible: true,
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<p>We would like to know a bit more about you!</p>",
                    },
                  },
                  {
                    id: "dropdown_gender",
                    visible: true,
                    category: "FIELD",
                    label: "Gender",
                    required: false,
                    sensitive: false,
                    type: "DROPDOWN",
                    config: {
                      options: [
                        { value: "male", label: "Male" },
                        { value: "female", label: "Female" },
                      ],
                      multiple: false,
                    },
                  },
                  {
                    id: "date_birthdate",
                    visible: true,
                    category: "FIELD",
                    label: "Birthdate",
                    required: false,
                    sensitive: false,
                    type: "DATE",
                    config: {
                      format: "DATE",
                    },
                  },
                  {
                    id: "next_btn",
                    visible: true,
                    type: "NEXT_BUTTON",
                    config: {
                      text: "Continue",
                    },
                  },
                ],
                next_node: "flow_update",
              },
            },
            {
              id: "flow_update",
              type: "FLOW",
              coordinates: { x: 300, y: 100 },
              alias: "Update User Flow",
              config: {
                flow_id: flow.id,
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "step_profile" },
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

    // Start the login flow
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
        form: { username: "test-update-user@example.com" },
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
      `/u/forms/${form.id}/nodes/step_profile?state=${state}`,
    );

    // Access the form step and verify it renders the DROPDOWN and DATE fields
    const formStepGet = await universalClient["forms"][form.id][
      "nodes"
    ].step_profile.$get({
      query: { state },
    });
    expect(formStepGet.status).toBe(200);
    const html = await formStepGet.text();
    expect(html).toContain("We would like to know a bit more about you!");
    expect(html).toContain("Gender"); // DROPDOWN label
    expect(html).toContain("Birthdate"); // DATE label
    expect(html).toContain("<select"); // DROPDOWN renders as select
    expect(html).toContain('type="date"'); // DATE renders as date input
    expect(html).toContain("Male");
    expect(html).toContain("Female");

    // Get the user before form submission to verify initial state
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    const session = await env.data.sessions.get(
      "tenantId",
      loginSession!.session_id!,
    );
    const userBefore = await env.data.users.get(
      "tenantId",
      session!.user_id!,
    );
    expect(userBefore).toBeTruthy();
    // Before submission, user should not have gender in user_metadata
    expect(
      (userBefore!.user_metadata as Record<string, unknown>)?.gender,
    ).toBeUndefined();

    // Submit the form with dropdown and date values
    const formStepPost = await universalClient["forms"][form.id][
      "nodes"
    ].step_profile.$post({
      query: { state },
      form: {
        dropdown_gender: "female",
        date_birthdate: "1990-05-15",
      },
    });
    expect(formStepPost.status).toBe(302);
    const postLocation = formStepPost.headers.get("location");

    // Should redirect to the client callback (flow ends after UPDATE_USER)
    expect(postLocation).toContain("https://example.com/callback");
    expect(postLocation).toContain("code=");

    // Verify the user was updated with the static value from the flow action
    const userAfter = await env.data.users.get(
      "tenantId",
      session!.user_id!,
    );
    expect(userAfter).toBeTruthy();
    expect(
      (userAfter!.user_metadata as Record<string, unknown>)?.gender,
    ).toBe("male"); // Static value from the flow action
  });

  it("should execute UPDATE_USER with template field references after submitting form", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a flow with UPDATE_USER action that uses {{$form.*}} templates
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "update-profile-from-fields",
          actions: [
            {
              id: "update_user_fields",
              type: "AUTH0",
              action: "UPDATE_USER",
              params: {
                user_id: "{{user.id}}",
                changes: {
                  "metadata.gender": "{{$form.dropdown_gender}}",
                  "metadata.birthdate": "{{$form.date_birthdate}}",
                  "address.country": "{{$form.dropdown_country}}",
                },
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

    // Create a form with DROPDOWN and DATE fields
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "form-with-field-templates",
          nodes: [
            {
              id: "step_info",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Info Step",
              config: {
                components: [
                  {
                    id: "rich_text_1",
                    visible: true,
                    type: "RICH_TEXT",
                    config: {
                      content: "<p>Tell us about yourself</p>",
                    },
                  },
                  {
                    id: "dropdown_gender",
                    visible: true,
                    category: "FIELD",
                    label: "Gender",
                    required: false,
                    sensitive: false,
                    type: "DROPDOWN",
                    config: {
                      options: [
                        { value: "male", label: "Male" },
                        { value: "female", label: "Female" },
                      ],
                    },
                  },
                  {
                    id: "dropdown_country",
                    visible: true,
                    category: "FIELD",
                    label: "Country",
                    required: false,
                    sensitive: false,
                    type: "DROPDOWN",
                    config: {
                      options: [
                        { value: "swe", label: "Sweden" },
                        { value: "nor", label: "Norway" },
                      ],
                    },
                  },
                  {
                    id: "date_birthdate",
                    visible: true,
                    category: "FIELD",
                    label: "Birthdate",
                    required: false,
                    sensitive: false,
                    type: "DATE",
                    config: { format: "DATE" },
                  },
                  {
                    id: "next_btn",
                    visible: true,
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "flow_update",
              },
            },
            {
              id: "flow_update",
              type: "FLOW",
              coordinates: { x: 300, y: 100 },
              alias: "Update Flow",
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
      form: { username: "test-template-fields@example.com" },
    });

    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);

    // Should be directed to the form step
    const enterCodeLocation = enterCodePostResponse.headers.get("location");
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step_info?state=${state}`,
    );

    // Submit the form with field values - these should be injected into the flow action via {{$form.*}}
    const formStepPost = await universalClient["forms"][form.id][
      "nodes"
    ].step_info.$post({
      query: { state },
      form: {
        dropdown_gender: "female",
        dropdown_country: "swe",
        date_birthdate: "1985-03-20",
      },
    });
    expect(formStepPost.status).toBe(302);
    const postLocation = formStepPost.headers.get("location");

    // Should complete the login flow
    expect(postLocation).toContain("https://example.com/callback");
    expect(postLocation).toContain("code=");

    // Verify the user was updated with the submitted field values
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    const session = await env.data.sessions.get(
      "tenantId",
      loginSession!.session_id!,
    );
    const userAfter = await env.data.users.get(
      "tenantId",
      session!.user_id!,
    );
    expect(userAfter).toBeTruthy();

    // metadata.gender should map to user_metadata.gender
    expect(
      (userAfter!.user_metadata as Record<string, unknown>)?.gender,
    ).toBe("female");

    // metadata.birthdate should map to user_metadata.birthdate
    expect(
      (userAfter!.user_metadata as Record<string, unknown>)?.birthdate,
    ).toBe("1985-03-20");

    // address.country should map to address.country (OIDC address claim)
    expect(
      (userAfter!.address as Record<string, unknown>)?.country,
    ).toBe("swe");
  });

  it("should skip UPDATE_USER when flow has no changes", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a flow with UPDATE_USER that references fields that won't be submitted
    const createFlowResponse = await managementClient.flows.$post(
      {
        json: {
          name: "update-empty-fields",
          actions: [
            {
              id: "update_user_empty",
              type: "AUTH0",
              action: "UPDATE_USER",
              params: {
                user_id: "{{user.id}}",
                changes: {
                  "metadata.something": "{{$form.nonexistent_field}}",
                },
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

    // Create a simple form
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "form-empty-fields",
          nodes: [
            {
              id: "step_simple",
              type: "STEP",
              coordinates: { x: 100, y: 100 },
              alias: "Simple Step",
              config: {
                components: [
                  {
                    id: "text_info",
                    visible: true,
                    type: "RICH_TEXT",
                    config: { content: "<p>Just click continue</p>" },
                  },
                  {
                    id: "next_btn",
                    visible: true,
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "flow_update",
              },
            },
            {
              id: "flow_update",
              type: "FLOW",
              coordinates: { x: 300, y: 100 },
              config: {
                flow_id: flow.id,
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "step_simple" },
          ending: {},
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(createFormResponse.status).toBe(201);
    const form = await createFormResponse.json();

    // Register hook
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

    // Login
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state3",
        nonce: "nonce3",
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
      form: { username: "test-skip-update@example.com" },
    });

    const email = getSentEmails()[0];
    const { code } = email.data;
    await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });

    // Submit the form (no field values submitted)
    const formStepPost = await universalClient["forms"][form.id][
      "nodes"
    ].step_simple.$post({
      query: { state },
      form: {},
    });
    expect(formStepPost.status).toBe(302);
    const postLocation = formStepPost.headers.get("location");

    // Should still complete the login flow successfully
    expect(postLocation).toContain("https://example.com/callback");
    expect(postLocation).toContain("code=");

    // Verify user_metadata was NOT modified (no changes resolved)
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    const session = await env.data.sessions.get(
      "tenantId",
      loginSession!.session_id!,
    );
    const userAfter = await env.data.users.get(
      "tenantId",
      session!.user_id!,
    );
    expect(userAfter).toBeTruthy();
    // "something" field should not exist since the template referenced a nonexistent field
    expect(
      (userAfter!.user_metadata as Record<string, unknown>)?.something,
    ).toBeUndefined();
  });
});
