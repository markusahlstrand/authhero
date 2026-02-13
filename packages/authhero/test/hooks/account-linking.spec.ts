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

  it("should NOT link accounts when email is not verified", async () => {
    const { env } = await getTestServer();

    // Create primary email/password user with verified email
    await env.data.users.create("tenantId", {
      user_id: "auth2|primary-unverified-test",
      email: "unverified-test@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create a Google user with same email but UNVERIFIED
    const result = await linkUsersHook(env.data)("tenantId", {
      email: "unverified-test@example.com",
      email_verified: false, // Not verified - should NOT link
      name: "Google User",
      nickname: "Google User",
      picture: "https://example.com/pic.png",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: "google-oauth2|unverified-google-user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should return the Google user (not linked)
    expect(result.user_id).toBe("google-oauth2|unverified-google-user");
    expect(result.linked_to).toBeUndefined();

    // Verify both users exist separately
    const allUsers = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: false,
      q: `email:"unverified-test@example.com"`,
    });
    expect(allUsers.users).toHaveLength(2);
    expect(allUsers.users.every((u) => !u.linked_to)).toBe(true);
  });

  it("should NOT link accounts across different tenants", async () => {
    const { env } = await getTestServer();

    // Create a second tenant
    await env.data.tenants.create({
      id: "tenantB",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
      friendly_name: "Tenant B",
    });

    // Create user in default tenant
    await env.data.users.create("tenantId", {
      user_id: "auth2|tenant-a-user",
      email: "cross-tenant@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create user with same email in tenant B - should NOT link to tenantId user
    const result = await linkUsersHook(env.data)("tenantB", {
      email: "cross-tenant@example.com",
      email_verified: true,
      name: "Tenant B User",
      nickname: "Tenant B User",
      picture: "https://example.com/pic.png",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: "google-oauth2|tenant-b-user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should return the new user (not linked to tenantId user)
    expect(result.user_id).toBe("google-oauth2|tenant-b-user");
    expect(result.linked_to).toBeUndefined();
  });

  it("should handle case-insensitive email matching", async () => {
    const { env } = await getTestServer();

    // Create primary user with lowercase email
    await env.data.users.create("tenantId", {
      user_id: "auth2|case-test-primary",
      email: "case.test@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create user with same email in different case - should link
    // The linkUsersHook normalizes email to lowercase for matching
    const result = await linkUsersHook(env.data)("tenantId", {
      email: "CASE.TEST@EXAMPLE.COM", // Upper case - normalized for matching
      email_verified: true,
      name: "Case Test User",
      nickname: "Case Test User",
      picture: "https://example.com/pic.png",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: "google-oauth2|case-test-secondary",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should return the primary user (linked via case-insensitive match)
    expect(result.user_id).toBe("auth2|case-test-primary");
    expect(result.identities).toHaveLength(2);

    // Verify the secondary user is linked to primary
    const secondaryUser = await env.data.users.get(
      "tenantId",
      "google-oauth2|case-test-secondary",
    );
    expect(secondaryUser?.linked_to).toBe("auth2|case-test-primary");
  });

  it("should link to primary user, not to already-linked user (no chain linking)", async () => {
    const { env } = await getTestServer();

    // Create the primary user
    await env.data.users.create("tenantId", {
      user_id: "auth2|chain-primary",
      email: "chain-test@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create a secondary user already linked to primary
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|chain-secondary",
      email: "chain-test@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      linked_to: "auth2|chain-primary",
    });

    // Create a third user with same email - should link to primary, not secondary
    const result = await linkUsersHook(env.data)("tenantId", {
      email: "chain-test@example.com",
      email_verified: true,
      name: "Third User",
      nickname: "Third User",
      picture: "https://example.com/pic.png",
      connection: "facebook",
      provider: "facebook",
      is_social: true,
      user_id: "facebook|chain-tertiary",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should return the PRIMARY user, not the secondary
    expect(result.user_id).toBe("auth2|chain-primary");
    expect(result.identities).toHaveLength(3);

    // Verify the third user is linked to primary
    const thirdUser = await env.data.users.get(
      "tenantId",
      "facebook|chain-tertiary",
    );
    expect(thirdUser?.linked_to).toBe("auth2|chain-primary");
  });

  it("should NOT link user with no email", async () => {
    const { env } = await getTestServer();

    // Create primary user
    await env.data.users.create("tenantId", {
      user_id: "auth2|no-email-primary",
      email: "no-email-test@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create user without email - should NOT link
    const result = await linkUsersHook(env.data)("tenantId", {
      // No email field
      name: "No Email User",
      nickname: "No Email User",
      picture: "https://example.com/pic.png",
      connection: "sms",
      provider: "sms",
      is_social: false,
      user_id: "sms|no-email-user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should return the new user (not linked)
    expect(result.user_id).toBe("sms|no-email-user");
    expect(result.linked_to).toBeUndefined();
  });

  it("should use setLinkedTo from hook when provided", async () => {
    const { env } = await getTestServer();

    // Create primary user
    const primary = await env.data.users.create("tenantId", {
      user_id: "auth2|hook-primary",
      email: "hook-primary@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create secondary user with linked_to already set (simulating setLinkedTo from hook)
    const result = await linkUsersHook(env.data)("tenantId", {
      email: "different-email@example.com", // Different email - normally wouldn't link
      email_verified: true,
      name: "Hook User",
      nickname: "Hook User",
      picture: "https://example.com/pic.png",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: "google-oauth2|hook-secondary",
      linked_to: primary.user_id, // Pre-set by setLinkedTo
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should return primary user even though emails don't match
    expect(result.user_id).toBe("auth2|hook-primary");
    expect(result.identities).toHaveLength(2);
  });

  it("should prioritize setLinkedTo over email-based linking", async () => {
    const { env } = await getTestServer();

    // Create two potential primary users
    await env.data.users.create("tenantId", {
      user_id: "auth2|priority-email-match",
      email: "priority-test@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    const manualPrimary = await env.data.users.create("tenantId", {
      user_id: "auth2|priority-manual-target",
      email: "different-priority@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
    });

    // Create user with email matching first user, but linked_to set to second user
    const result = await linkUsersHook(env.data)("tenantId", {
      email: "priority-test@example.com", // Matches first user
      email_verified: true,
      name: "Priority User",
      nickname: "Priority User",
      picture: "https://example.com/pic.png",
      connection: "google-oauth2",
      provider: "google-oauth2",
      is_social: true,
      user_id: "google-oauth2|priority-user",
      linked_to: manualPrimary.user_id, // Manually set to second user
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      login_count: 0,
    });

    // Should link to the manually specified user, NOT the email-matched user
    expect(result.user_id).toBe("auth2|priority-manual-target");
    expect(result.identities).toHaveLength(2);
  });
});
