import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { nanoid } from "nanoid";
import { getTestServer, TestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";
import { USERNAME_PASSWORD_PROVIDER } from "../../../src/constants";

// End-to-end profile-completion flow on universal login v2 (/u2):
// a post-login form hook whose ROUTER checks `not_exists` on
// user_metadata.birthdate / phone_number, shows a STEP with required
// DATE + TEL fields, stamps the submitted values on the user via an
// AUTH0 UPDATE_USER flow action, and completes the login. A second
// login of the same user must skip the form entirely.

/**
 * Creates the profile-completion setup on the test tenant: a flow with an
 * AUTH0 UPDATE_USER action stamping birthdate + phone from the form fields,
 * a form whose ROUTER shows the STEP (required DATE + TEL) when either
 * field is missing on the user, and a post-login hook registering the form.
 * Two router rules pointing at the same step act as an OR — the engine has
 * no OR operator.
 */
async function setupProfileCompletionForm(
  testServer: TestServer,
  token: string,
): Promise<{ id: string }> {
  const managementClient = testClient(testServer.managementApp, testServer.env);
  const createFlowResponse = await managementClient.flows.$post(
    {
      json: {
        name: "complete-profile-flow",
        actions: [
          {
            id: "update_user_profile",
            type: "AUTH0",
            action: "UPDATE_USER",
            params: {
              user_id: "{{user.id}}",
              changes: {
                "metadata.birthdate": "{{$form.date_birthdate}}",
                phone_number: "{{$form.tel_phone}}",
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

  const createFormResponse = await managementClient.forms.$post(
    {
      json: {
        name: "complete-profile-form",
        nodes: [
          {
            id: "router_profile",
            type: "ROUTER",
            coordinates: { x: 100, y: 100 },
            alias: "Profile Complete Router",
            config: {
              rules: [
                {
                  id: "rule_missing_birthdate",
                  alias: "Missing birthdate",
                  condition: {
                    operator: "not_exists",
                    field: "{{context.user.user_metadata.birthdate}}",
                  },
                  next_node: "step_profile",
                },
                {
                  id: "rule_missing_phone",
                  alias: "Missing phone number",
                  condition: {
                    operator: "not_exists",
                    field: "{{context.user.phone_number}}",
                  },
                  next_node: "step_profile",
                },
              ],
              fallback: "$ending",
            },
          },
          {
            id: "step_profile",
            type: "STEP",
            coordinates: { x: 300, y: 100 },
            alias: "Complete Profile",
            config: {
              components: [
                {
                  id: "rich_text_intro",
                  visible: true,
                  type: "RICH_TEXT",
                  config: {
                    content: "<p>Please complete your profile</p>",
                  },
                },
                {
                  id: "date_birthdate",
                  visible: true,
                  category: "FIELD",
                  label: "Birthdate",
                  required: true,
                  sensitive: false,
                  type: "DATE",
                  config: { format: "DATE" },
                },
                {
                  id: "tel_phone",
                  visible: true,
                  category: "FIELD",
                  label: "Phone number",
                  required: true,
                  sensitive: false,
                  type: "TEL",
                  config: {},
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
            coordinates: { x: 500, y: 100 },
            alias: "Stamp Profile",
            config: {
              flow_id: flow.id,
              next_node: "$ending",
            },
          },
        ],
        start: { next_node: "router_profile" },
        ending: {},
      },
      header: { "tenant-id": "tenantId" },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
  expect(createFormResponse.status).toBe(201);
  const form = await createFormResponse.json();

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

  return form;
}

describe("u2 forms - profile completion (router not_exists + required fields + UPDATE_USER)", () => {
  it("should require birthdate and phone on first login, stamp them on the user, and skip the form on the next login", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const { universalApp, u2App, oauthApp, getSentEmails, env } = testServer;
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const token = await getAdminToken();

    // Use universal login v2 so the form hook redirects to /u2
    await env.data.clients.update("tenantId", "clientId", {
      client_metadata: {
        universal_login_version: "2",
      },
    });

    const form = await setupProfileCompletionForm(testServer, token);

    // --------------------------------------------------
    // First login: profile incomplete -> form is enforced
    // --------------------------------------------------
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state1",
        nonce: "nonce1",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const universalUrl = new URL(
      `https://example.com${authorizeResponse.headers.get("location")}`,
    );
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    // Login with email code flow
    await universalClient.login.identifier.$post({
      query: { state },
      form: { username: "profile-completion@example.com" },
    });
    const { code } = getSentEmails()[0].data;
    const enterCodePostResponse = await universalClient.login[
      "email-otp-challenge"
    ].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);

    // The router matches not_exists on birthdate -> redirect to the u2 form
    expect(enterCodePostResponse.headers.get("location")).toBe(
      `/u2/forms/${form.id}/nodes/step_profile?state=${state}`,
    );

    // The u2 form node renders the widget page with both required fields
    const formNodeGet = await u2App.request(
      `http://localhost/forms/${form.id}/nodes/step_profile?state=${encodeURIComponent(state)}`,
      { method: "GET" },
      env,
    );
    expect(formNodeGet.status).toBe(200);
    const html = await formNodeGet.text();
    expect(html).toContain("authhero-widget");
    expect(html).toContain("Please complete your profile");
    expect(html).toContain("date_birthdate");
    expect(html).toContain("tel_phone");

    // Submitting without values re-renders the screen with an error
    const emptySubmit = await u2App.request(
      `http://localhost/forms/${form.id}/nodes/step_profile?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: {} }),
      },
      env,
    );
    expect(emptySubmit.status).toBe(200);
    const emptySubmitBody = await emptySubmit.json();
    expect(emptySubmitBody.redirect).toBeUndefined();
    expect(emptySubmitBody.screen).toBeTruthy();
    const errorMessages = emptySubmitBody.screen.messages;
    expect(errorMessages).toBeTruthy();
    expect(errorMessages[0].type).toBe("error");
    expect(errorMessages[0].text).toContain("Missing required fields");
    expect(errorMessages[0].text).toContain("Birthdate");
    expect(errorMessages[0].text).toContain("Phone number");

    // Submitting only one of the two required fields is also rejected
    const partialSubmit = await u2App.request(
      `http://localhost/forms/${form.id}/nodes/step_profile?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: { date_birthdate: "1990-05-15" } }),
      },
      env,
    );
    expect(partialSubmit.status).toBe(200);
    const partialSubmitBody = await partialSubmit.json();
    expect(partialSubmitBody.redirect).toBeUndefined();
    expect(partialSubmitBody.screen.messages[0].text).toContain("Phone number");
    expect(partialSubmitBody.screen.messages[0].text).not.toContain(
      "Birthdate",
    );

    // Submitting both fields stamps the user and completes the login
    const fullSubmit = await u2App.request(
      `http://localhost/forms/${form.id}/nodes/step_profile?state=${encodeURIComponent(state)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: {
            date_birthdate: "1990-05-15",
            tel_phone: "+46701234567",
          },
        }),
      },
      env,
    );
    expect(fullSubmit.status).toBe(200);
    const fullSubmitBody = await fullSubmit.json();
    expect(fullSubmitBody.redirect).toBeTruthy();
    const redirectUrl = new URL(fullSubmitBody.redirect);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      "https://example.com/callback",
    );
    expect(redirectUrl.searchParams.get("code")).toBeTruthy();

    // Verify the values were stamped on the user
    const loginSession = await env.data.loginSessions.get("tenantId", state);
    const session = await env.data.sessions.get(
      "tenantId",
      loginSession!.session_id!,
    );
    const userAfter = await env.data.users.get("tenantId", session!.user_id!);
    expect(userAfter).toBeTruthy();
    expect(
      (userAfter!.user_metadata as Record<string, unknown>)?.birthdate,
    ).toBe("1990-05-15");
    expect(userAfter!.phone_number).toBe("+46701234567");

    // --------------------------------------------------
    // Second login: profile complete -> no form, login completes directly
    // --------------------------------------------------
    const authorizeResponse2 = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state2",
        nonce: "nonce2",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse2.status).toBe(302);
    const universalUrl2 = new URL(
      `https://example.com${authorizeResponse2.headers.get("location")}`,
    );
    const state2 = universalUrl2.searchParams.get("state");
    if (!state2) throw new Error("No state found");

    await universalClient.login.identifier.$post({
      query: { state: state2 },
      form: { username: "profile-completion@example.com" },
    });
    const sentEmails = getSentEmails();
    const { code: code2 } = sentEmails[sentEmails.length - 1].data;
    const enterCodePostResponse2 = await universalClient.login[
      "email-otp-challenge"
    ].$post({
      query: { state: state2 },
      form: { code: code2 },
    });
    expect(enterCodePostResponse2.status).toBe(302);

    // All router rules fail (both fields exist) -> fallback $ending -> the
    // hook returns without interrupting and the login completes directly
    const secondLoginLocation = enterCodePostResponse2.headers.get("location");
    expect(secondLoginLocation).toContain("https://example.com/callback");
    expect(secondLoginLocation).toContain("code=");
  });

  it("should stamp the profile on the primary user when the login gets account-linked to an older account", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const { u2App, oauthApp, env } = testServer;
    const oauthClient = testClient(oauthApp, env);
    const token = await getAdminToken();

    // Use universal login v2 so the form hook redirects to /u2
    await env.data.clients.update("tenantId", "clientId", {
      client_metadata: {
        universal_login_version: "2",
      },
    });

    const form = await setupProfileCompletionForm(testServer, token);

    // Account-linking template hook: the social identity logging in below
    // shares its (verified) email with an older password account and must be
    // linked to it BEFORE the form runs.
    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-login",
      template_id: "account-linking",
      enabled: true,
    });

    // The older canonical account with the same email — no birthdate/phone,
    // so the router must show the profile form for it.
    const primaryId = `${USERNAME_PASSWORD_PROVIDER}|older-account`;
    await env.data.users.create("tenantId", {
      user_id: primaryId,
      email: "hello@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Username-Password-Authentication",
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
    });

    // Social login via the mock strategy (its default response is sub "123"
    // with email "hello@example.com", which is not among the fixture users).
    await env.data.connections.create("tenantId", {
      id: "connectionId",
      name: "mock-strategy",
      strategy: "mock-strategy",
      options: { client_id: "socialClientId", client_secret: "secret" },
    });

    const loginSession = await env.data.loginSessions.create("tenantId", {
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      csrf_token: "csrfToken",
      authParams: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: AuthorizationResponseType.CODE,
        state: "client-state",
        nonce: "nonce",
        scope: "openid email profile",
      },
    });
    const stateCode = await env.data.codes.create("tenantId", {
      code_id: nanoid(),
      code_type: "oauth2_state",
      login_id: loginSession.id,
      connection_id: "connectionId",
      code_verifier: "verifier",
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    });

    const callbackResponse = await oauthClient.callback.$get({
      query: {
        state: stateCode.code_id,
        code: "any-code",
      },
    });
    expect(callbackResponse.status).toBe(302);

    // The social callback bounces through /authorize/resume — follow it.
    const resumeLocation = callbackResponse.headers.get("location");
    expect(resumeLocation).toContain("/authorize/resume");
    const resumeResponse = await oauthApp.request(
      `http://localhost${resumeLocation}`,
      { method: "GET" },
      env,
    );
    expect(resumeResponse.status).toBe(302);

    // Account linking ran before the form hook: the social identity is now a
    // secondary of the older account, and the form was dispatched because the
    // PRIMARY is missing birthdate/phone.
    expect(resumeResponse.headers.get("location")).toBe(
      `/u2/forms/${form.id}/nodes/step_profile?state=${loginSession.id}`,
    );

    const { users } = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:hello@example.com",
    });
    const secondary = users.find((u) => u.linked_to);
    expect(secondary).toBeTruthy();
    expect(secondary!.linked_to).toBe(primaryId);

    // Submit the form — the values must land on the primary even though the
    // session points at the (secondary) social identity.
    const fullSubmit = await u2App.request(
      `http://localhost/forms/${form.id}/nodes/step_profile?state=${encodeURIComponent(loginSession.id)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: {
            date_birthdate: "1985-03-20",
            tel_phone: "+46709876543",
          },
        }),
      },
      env,
    );
    expect(fullSubmit.status).toBe(200);
    const fullSubmitBody = await fullSubmit.json();
    expect(fullSubmitBody.redirect).toBeTruthy();
    const redirectUrl = new URL(fullSubmitBody.redirect);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      "https://example.com/callback",
    );
    expect(redirectUrl.searchParams.get("code")).toBeTruthy();

    // The primary got the profile values...
    const primaryAfter = await env.data.users.get("tenantId", primaryId);
    expect(
      (primaryAfter!.user_metadata as Record<string, unknown>)?.birthdate,
    ).toBe("1985-03-20");
    expect(primaryAfter!.phone_number).toBe("+46709876543");

    // ...and the secondary identity was left untouched.
    const secondaryAfter = await env.data.users.get(
      "tenantId",
      secondary!.user_id,
    );
    expect(
      (secondaryAfter!.user_metadata as Record<string, unknown>)?.birthdate,
    ).toBeUndefined();
    expect(secondaryAfter!.phone_number).toBeFalsy();
  });
});
