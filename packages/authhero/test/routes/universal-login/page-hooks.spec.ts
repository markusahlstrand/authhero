import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { AuthorizationResponseType } from "@authhero/adapter-interfaces";
import { getTestServer } from "../../helpers/test-server";
import { getAdminToken } from "../../helpers/token";

// End-to-end coverage for page hooks persisted through the management API.
// Until page hooks gained their own schema variant and adapter columns they
// could only be injected by monkeypatching `hooks.list` in tests, so nothing
// verified that a real, stored hook row survives the round-trip and interrupts
// a login. These tests drive a full email-OTP login against a created hook.

async function createImpersonatePageHook(
  managementClient: ReturnType<typeof testClient>,
  token: string,
  extra: Record<string, unknown> = {},
) {
  return managementClient.hooks.$post(
    {
      json: {
        trigger_id: "post-user-login",
        page_id: "impersonate",
        permission_required: "users:impersonate",
        enabled: true,
        ...extra,
      },
      header: { "tenant-id": "tenantId" },
    },
    { headers: { authorization: `Bearer ${token}` } },
  );
}

/**
 * Runs a complete email-OTP login for `email` and returns the location header
 * of the final response — either the page-hook redirect or the callback.
 */
async function loginWithEmailOtp(
  testServer: Awaited<ReturnType<typeof getTestServer>>,
  email: string,
): Promise<string | null> {
  const { universalApp, oauthApp, getSentEmails, env } = testServer;
  const oauthClient = testClient(oauthApp, env);
  const universalClient = testClient(universalApp, env);

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

  const identifierResponse = await universalClient.login.identifier.$post({
    query: { state },
    form: { username: email },
  });
  expect(identifierResponse.status).toBe(302);

  const emails = getSentEmails();
  const { code } = emails[emails.length - 1]!.data;
  const codeResponse = await universalClient.login["email-otp-challenge"].$post(
    {
      query: { state },
      form: { code },
    },
  );
  expect(codeResponse.status).toBe(302);
  return codeResponse.headers.get("location");
}

describe("page hooks", () => {
  it("persists a page hook through the management API and returns it on list", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const createResponse = await createImpersonatePageHook(
      managementClient,
      token,
      { metadata: { inheritable: true } },
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.page_id).toBe("impersonate");
    expect(created.permission_required).toBe("users:impersonate");

    // The columns must survive a re-read, not just the create response echo.
    const stored = await env.data.hooks.get("tenantId", created.hook_id);
    expect(stored).toMatchObject({
      page_id: "impersonate",
      permission_required: "users:impersonate",
      trigger_id: "post-user-login",
      enabled: true,
      metadata: { inheritable: true },
    });
  });

  it("rejects a page hook on a trigger other than post-user-login", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.hooks.$post(
      {
        json: {
          trigger_id: "post-user-registration",
          page_id: "impersonate",
          enabled: true,
        },
        header: { "tenant-id": "tenantId" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(400);
  });

  it("interrupts the login with the page when the user holds the permission", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const { managementApp, env } = testServer;
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    expect(
      (await createImpersonatePageHook(managementClient, token)).status,
    ).toBe(201);

    // foo@example.com is a fixture user on the test tenant.
    const { users } = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:foo@example.com",
    });
    const user = users[0]!;
    await env.data.userPermissions.create("tenantId", user.user_id, {
      user_id: user.user_id,
      resource_server_identifier: "https://api.example.com/",
      permission_name: "users:impersonate",
    });

    const location = await loginWithEmailOtp(testServer, "foo@example.com");
    expect(location).toMatch(/^\/u\/impersonate\?state=/);
  });

  it("completes the login normally when the user lacks the permission", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const { managementApp, env } = testServer;
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    expect(
      (await createImpersonatePageHook(managementClient, token)).status,
    ).toBe(201);

    const location = await loginWithEmailOtp(testServer, "foo@example.com");
    expect(location).toContain("https://example.com/callback");
    expect(location).not.toContain("/u/impersonate");
  });

  it("does not interrupt when the hook is disabled", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
      testTenantLanguage: "en",
    });
    const { managementApp, env } = testServer;
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    expect(
      (
        await createImpersonatePageHook(managementClient, token, {
          enabled: false,
        })
      ).status,
    ).toBe(201);

    const { users } = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:foo@example.com",
    });
    const user = users[0]!;
    await env.data.userPermissions.create("tenantId", user.user_id, {
      user_id: user.user_id,
      resource_server_identifier: "https://api.example.com/",
      permission_name: "users:impersonate",
    });

    const location = await loginWithEmailOtp(testServer, "foo@example.com");
    expect(location).toContain("https://example.com/callback");
  });
});
