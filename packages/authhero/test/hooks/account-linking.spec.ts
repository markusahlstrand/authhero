import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { linkUsersHook } from "../../src/hooks/link-users";

describe("account-linking-hook", () => {
  it("should link an account to a matching existing verified account", async () => {
    const { env } = await getTestServer();

    // Add a test user. Creating the user will not trigger the hoos
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
});
