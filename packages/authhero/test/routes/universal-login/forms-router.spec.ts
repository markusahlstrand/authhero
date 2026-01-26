import { describe, it, expect } from "vitest";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

// This test covers form routing based on user context (e.g., email domain)

describe("forms - router node with user context", () => {
  it("should route to the correct step node based on user email domain using ends_with", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a form with a ROUTER node that checks email domain
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "email-router-form",
          nodes: [
            {
              id: "router_email",
              type: "ROUTER",
              coordinates: { x: 200, y: 100 },
              alias: "Email Domain Router",
              config: {
                rules: [
                  {
                    id: "rule_example",
                    alias: "Example.com users",
                    condition: {
                      operator: "ends_with",
                      field: "{{context.user.email}}",
                      value: "example.com",
                    },
                    next_node: "step_example",
                  },
                  {
                    id: "rule_other",
                    alias: "Other domain users",
                    condition: {
                      operator: "ends_with",
                      field: "{{context.user.email}}",
                      value: "other.com",
                    },
                    next_node: "step_other",
                  },
                ],
                fallback: "$ending",
              },
            },
            {
              id: "step_example",
              type: "STEP",
              coordinates: { x: 400, y: 50 },
              alias: "Example Domain Step",
              config: {
                components: [
                  {
                    id: "example-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Welcome Example User</h2><p>You are from example.com!</p>",
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
                next_node: "$ending",
              },
            },
            {
              id: "step_other",
              type: "STEP",
              coordinates: { x: 400, y: 150 },
              alias: "Other Domain Step",
              config: {
                components: [
                  {
                    id: "other-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Welcome Other User</h2><p>You are from other.com!</p>",
                    },
                  },
                  {
                    id: "continue-btn-other",
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
          start: { next_node: "router_email" },
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

    // --------------------------------------------------
    // Test Case 1: User with example.com email should go to step_example
    // --------------------------------------------------
    const authorizeResponse1 = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state1",
        nonce: "nonce1",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse1.status).toBe(302);
    const location1 = authorizeResponse1.headers.get("location");
    const universalUrl1 = new URL(`https://example.com${location1}`);
    const state1 = universalUrl1.searchParams.get("state");
    if (!state1) throw new Error("No state found");

    // Login with example.com email
    const enterEmailPostResponse1 =
      await universalClient.login.identifier.$post({
        query: { state: state1 },
        form: { username: "user@example.com" },
      });
    expect(enterEmailPostResponse1.status).toBe(302);

    // Enter code
    const email1 = getSentEmails()[0];
    const { code: code1 } = email1.data;
    const enterCodePostResponse1 = await universalClient["enter-code"].$post({
      query: { state: state1 },
      form: { code: code1 },
    });
    expect(enterCodePostResponse1.status).toBe(302);
    const enterCodeLocation1 = enterCodePostResponse1.headers.get("location");

    // Should be routed to step_example (not router_email)
    expect(enterCodeLocation1).toBe(
      `/u/forms/${form.id}/nodes/step_example?state=${state1}`,
    );

    // Verify the form content
    const formNodeGet1 = await universalClient["forms"][form.id][
      "nodes"
    ].step_example.$get({ query: { state: state1 } });
    expect(formNodeGet1.status).toBe(200);
    const html1 = await formNodeGet1.text();
    expect(html1).toContain("Welcome Example User");
    expect(html1).toContain("You are from example.com!");
  });

  it("should use fallback when no router rule matches", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a form with a ROUTER node that only matches specific domains
    // but has a fallback to a STEP node (not $ending)
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "fallback-router-form",
          nodes: [
            {
              id: "router_check",
              type: "ROUTER",
              coordinates: { x: 200, y: 100 },
              alias: "Domain Check Router",
              config: {
                rules: [
                  {
                    id: "rule_vip",
                    alias: "VIP domain",
                    condition: {
                      operator: "ends_with",
                      field: "{{context.user.email}}",
                      value: "vip.com",
                    },
                    next_node: "step_vip",
                  },
                ],
                fallback: "step_regular", // Non-VIP users go to regular step
              },
            },
            {
              id: "step_vip",
              type: "STEP",
              coordinates: { x: 400, y: 50 },
              alias: "VIP Step",
              config: {
                components: [
                  {
                    id: "vip-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>VIP Welcome</h2><p>Special content for VIP users!</p>",
                    },
                  },
                  {
                    id: "vip-btn",
                    type: "NEXT_BUTTON",
                    config: {
                      text: "Continue",
                    },
                  },
                ],
                next_node: "$ending",
              },
            },
            {
              id: "step_regular",
              type: "STEP",
              coordinates: { x: 400, y: 150 },
              alias: "Regular Step",
              config: {
                components: [
                  {
                    id: "regular-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Regular Welcome</h2><p>Hello regular user!</p>",
                    },
                  },
                  {
                    id: "regular-btn",
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
          start: { next_node: "router_check" },
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

    // Login with a non-VIP email - should go to fallback step_regular
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state_fallback",
        nonce: "nonce_fallback",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    expect(authorizeResponse.status).toBe(302);
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    // Login with non-VIP email (completely different domain)
    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "regular@ordinary.org" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    // Enter code
    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");

    // Should go to step_regular (fallback), NOT step_vip
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step_regular?state=${state}`,
    );

    // Verify the form content shows regular message
    const formNodeGet = await universalClient["forms"][form.id][
      "nodes"
    ].step_regular.$get({ query: { state } });
    expect(formNodeGet.status).toBe(200);
    const html = await formNodeGet.text();
    expect(html).toContain("Regular Welcome");
    expect(html).toContain("Hello regular user!");
  });

  it("should support starts_with operator in router conditions", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a form with starts_with condition
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "starts-with-form",
          nodes: [
            {
              id: "router_prefix",
              type: "ROUTER",
              coordinates: { x: 200, y: 100 },
              alias: "Email Prefix Router",
              config: {
                rules: [
                  {
                    id: "rule_admin",
                    alias: "Admin users",
                    condition: {
                      operator: "starts_with",
                      field: "{{context.user.email}}",
                      value: "admin",
                    },
                    next_node: "step_admin",
                  },
                ],
                fallback: "step_regular",
              },
            },
            {
              id: "step_admin",
              type: "STEP",
              coordinates: { x: 400, y: 50 },
              alias: "Admin Step",
              config: {
                components: [
                  {
                    id: "admin-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Admin Panel</h2><p>Welcome administrator!</p>",
                    },
                  },
                  {
                    id: "admin-btn",
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "$ending",
              },
            },
            {
              id: "step_regular",
              type: "STEP",
              coordinates: { x: 400, y: 150 },
              alias: "Regular Step",
              config: {
                components: [
                  {
                    id: "regular-text",
                    type: "RICH_TEXT",
                    config: {
                      content: "<h2>Welcome</h2><p>Hello regular user!</p>",
                    },
                  },
                  {
                    id: "regular-btn",
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "router_prefix" },
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

    // Login with admin@ email
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state_admin",
        nonce: "nonce_admin",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "admin@company.com" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");

    // Should be routed to step_admin
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step_admin?state=${state}`,
    );

    // Verify the form content shows admin panel
    const formNodeGet = await universalClient["forms"][form.id][
      "nodes"
    ].step_admin.$get({ query: { state } });
    expect(formNodeGet.status).toBe(200);
    const html = await formNodeGet.text();
    expect(html).toContain("Admin Panel");
    expect(html).toContain("Welcome administrator!");
  });

  it("should support contains operator in router conditions", async () => {
    const { universalApp, oauthApp, managementApp, getSentEmails, env } =
      await getTestServer({
        mockEmail: true,
        testTenantLanguage: "en",
      });
    const oauthClient = testClient(oauthApp, env);
    const universalClient = testClient(universalApp, env);
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Create a form with contains condition
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "contains-form",
          nodes: [
            {
              id: "router_contains",
              type: "ROUTER",
              coordinates: { x: 200, y: 100 },
              alias: "Contains Router",
              config: {
                rules: [
                  {
                    id: "rule_test",
                    alias: "Test accounts",
                    condition: {
                      operator: "contains",
                      field: "{{context.user.email}}",
                      value: "+test",
                    },
                    next_node: "step_test",
                  },
                ],
                fallback: "step_prod",
              },
            },
            {
              id: "step_test",
              type: "STEP",
              coordinates: { x: 400, y: 50 },
              alias: "Test Step",
              config: {
                components: [
                  {
                    id: "test-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Test Mode</h2><p>This is a test account!</p>",
                    },
                  },
                  {
                    id: "test-btn",
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "$ending",
              },
            },
            {
              id: "step_prod",
              type: "STEP",
              coordinates: { x: 400, y: 150 },
              alias: "Production Step",
              config: {
                components: [
                  {
                    id: "prod-text",
                    type: "RICH_TEXT",
                    config: {
                      content:
                        "<h2>Production</h2><p>Welcome to production!</p>",
                    },
                  },
                  {
                    id: "prod-btn",
                    type: "NEXT_BUTTON",
                    config: { text: "Continue" },
                  },
                ],
                next_node: "$ending",
              },
            },
          ],
          start: { next_node: "router_contains" },
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

    // Login with email containing +test
    const authorizeResponse = await oauthClient.authorize.$get({
      query: {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        state: "state_contains",
        nonce: "nonce_contains",
        scope: "openid email profile",
        response_type: AuthorizationResponseType.CODE,
      },
    });
    const location = authorizeResponse.headers.get("location");
    const universalUrl = new URL(`https://example.com${location}`);
    const state = universalUrl.searchParams.get("state");
    if (!state) throw new Error("No state found");

    const enterEmailPostResponse = await universalClient.login.identifier.$post(
      {
        query: { state },
        form: { username: "user+test@domain.com" },
      },
    );
    expect(enterEmailPostResponse.status).toBe(302);

    const email = getSentEmails()[0];
    const { code } = email.data;
    const enterCodePostResponse = await universalClient["enter-code"].$post({
      query: { state },
      form: { code },
    });
    expect(enterCodePostResponse.status).toBe(302);
    const enterCodeLocation = enterCodePostResponse.headers.get("location");

    // Should be routed to step_test
    expect(enterCodeLocation).toBe(
      `/u/forms/${form.id}/nodes/step_test?state=${state}`,
    );

    // Verify the form content
    const formNodeGet = await universalClient["forms"][form.id][
      "nodes"
    ].step_test.$get({ query: { state } });
    expect(formNodeGet.status).toBe(200);
    const html = await formNodeGet.text();
    expect(html).toContain("Test Mode");
    expect(html).toContain("This is a test account!");
  });
});
