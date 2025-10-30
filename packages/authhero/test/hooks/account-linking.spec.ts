import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { linkUsersHook } from "../../src/hooks/link-users";
import { addDataHooks } from "../../src/hooks";

describe("account-linking-hook", () => {
  it("should link an account to a matching existing verified account", async () => {
    const { env } = await getTestServer();

    // Add a test user. Creating the user will not trigger the hooks
    await linkUsersHook(env.data)("tenantId", {
      email: "foo@example.com",
      email_verified: true,
      name: "Test Google User",
      nickname: "Test User",
      picture: "https://example.com/test.png",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: false,
      user_id: "google-oauth2|userId",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    const originalUser = await env.data.users.get("tenantId", "email|userId");
    expect(originalUser?.identities?.length).toBe(2);
  });

  it("should link accounts when user email is updated to match another user", async () => {
    const { env } = await getTestServer();

    // Create a mock context for hooks
    const mockCtx: any = {
      req: {
        method: "POST",
        url: "http://test",
        path: "/test",
        header: () => undefined,
        queries: () => ({}),
      },
      env,
      var: {
        ip: "127.0.0.1",
        useragent: "test-agent",
        auth0_client: undefined,
        body: undefined,
        client_id: "test-client",
      },
    };

    // Wrap the data adapter with hooks
    const dataWithHooks = addDataHooks(mockCtx, env.data);

    // Create primary email/password user
    const primaryUser = await env.data.users.create("tenantId", {
      user_id: "auth2|primary-user",
      email: "original-test2@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create a separate Google user with different email
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|google-user",
      email: "google-test2@example.com",
      email_verified: true,
      name: "Google User",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    // Verify they are separate users initially
    const allUsers = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
    });
    const beforeUpdate = {
      users: allUsers.users.filter(
        (u) =>
          u.email === "original-test2@example.com" ||
          u.email === "google-test2@example.com",
      ),
    };
    expect(beforeUpdate.users).toHaveLength(2);
    expect(beforeUpdate.users.every((u) => !u.linked_to)).toBe(true);

    // User updates their primary email to match the Google account email
    // Use the wrapped adapter to trigger hooks
    await dataWithHooks.users.update("tenantId", primaryUser.user_id, {
      email: "google-test2@example.com",
    });

    // After linking, verify the accounts are linked
    const afterUpdate = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
      q: `email:"google-test2@example.com"`,
    });

    const primaryUsers = afterUpdate.users.filter((u) => !u.linked_to);
    const linkedUsers = afterUpdate.users.filter((u) => u.linked_to);

    // Should only have one primary user with the other linked
    expect(primaryUsers).toHaveLength(1);
    expect(linkedUsers).toHaveLength(1);
    expect(linkedUsers[0]?.linked_to).toEqual(primaryUsers[0]?.user_id);
  });

  it("should link accounts when social user email is verified and matches existing user", async () => {
    const { env } = await getTestServer();

    // Create a mock context for hooks
    const mockCtx: any = {
      req: {
        method: "POST",
        url: "http://test",
        path: "/test",
        header: () => undefined,
        queries: () => ({}),
      },
      env,
      var: {
        ip: "127.0.0.1",
        useragent: "test-agent",
        auth0_client: undefined,
        body: undefined,
        client_id: "test-client",
      },
    };

    // Wrap the data adapter with hooks
    const dataWithHooks = addDataHooks(mockCtx, env.data);

    // Create primary email/password user
    await env.data.users.create("tenantId", {
      user_id: "auth2|primary-user-2",
      email: "user-test3@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create a Google user with same email but unverified
    const googleUser = await env.data.users.create("tenantId", {
      user_id: "google-oauth2|google-user-2",
      email: "user-test3@example.com",
      email_verified: false,
      name: "Google User",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    // Verify they are separate initially (not linked due to unverified email)
    const beforeVerification = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
      q: `email:"user-test3@example.com"`,
    });
    expect(beforeVerification.users).toHaveLength(2);
    expect(beforeVerification.users.every((u) => !u.linked_to)).toBe(true);

    // Social provider verifies the email
    // Use the wrapped adapter to trigger hooks
    await dataWithHooks.users.update("tenantId", googleUser.user_id, {
      email_verified: true,
    });

    // After email verification, accounts should be linked
    const afterVerification = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
      q: `email:"user-test3@example.com"`,
    });

    const primaryUsers = afterVerification.users.filter((u) => !u.linked_to);
    const linkedUsers = afterVerification.users.filter((u) => u.linked_to);

    expect(primaryUsers).toHaveLength(1);
    expect(linkedUsers).toHaveLength(1);
    expect(linkedUsers[0]?.linked_to).toEqual(primaryUsers[0]?.user_id);
  });
});
