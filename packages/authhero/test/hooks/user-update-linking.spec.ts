import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

function createMockCtx(env: any): any {
  return {
    req: {
      method: "PATCH",
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
}

describe("user update auto-linking", () => {
  it("should auto-link when email_verified becomes true and a primary user exists", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    // Create a primary user with verified email
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|primary-verify`,
      email: "shared-verify@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // Create a secondary user with unverified email (won't auto-link)
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|secondary-verify",
      email: "shared-verify@example.com",
      email_verified: false,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    // Verify not linked initially
    const before = await env.data.users.get(
      "tenantId",
      "google-oauth2|secondary-verify",
    );
    expect(before?.linked_to).toBeUndefined();

    // Now verify the email - should trigger auto-linking
    await dataWithHooks.users.update(
      "tenantId",
      "google-oauth2|secondary-verify",
      { email_verified: true },
    );

    // Verify it's linked to the primary
    const after = await env.data.users.get(
      "tenantId",
      "google-oauth2|secondary-verify",
    );
    expect(after?.linked_to).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|primary-verify`,
    );
  });

  it("should not overwrite an existing linked_to value", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    // Create primary1 with email A
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|primary-a`,
      email: "email-a-overwrite@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // Create secondary with email A, unverified
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|secondary-overwrite",
      email: "email-a-overwrite@example.com",
      email_verified: false,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    // Verify email to trigger auto-linking to primary1
    await dataWithHooks.users.update(
      "tenantId",
      "google-oauth2|secondary-overwrite",
      { email_verified: true },
    );

    // Confirm it's now linked to primary1
    const afterLink = await env.data.users.get(
      "tenantId",
      "google-oauth2|secondary-overwrite",
    );
    expect(afterLink?.linked_to).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|primary-a`,
    );

    // Create primary2 with email B
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|primary-b`,
      email: "email-b-overwrite@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // Update the already-linked user's email to match primary2
    await dataWithHooks.users.update(
      "tenantId",
      "google-oauth2|secondary-overwrite",
      { email: "email-b-overwrite@example.com" },
    );

    // Verify linked_to is still pointing to primary1, not overwritten
    const afterUpdate = await env.data.users.get(
      "tenantId",
      "google-oauth2|secondary-overwrite",
    );
    expect(afterUpdate?.linked_to).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|primary-a`,
    );
  });

  it("should not auto-link when the only matching user is itself", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    // Create a single user with verified email
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|solo-user`,
      email: "solo-unique@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // Update the user's email to trigger the linking code path
    await dataWithHooks.users.update(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|solo-user`,
      { email: "solo-unique@example.com" },
    );

    // Verify user is NOT linked to itself
    const after = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|solo-user`,
    );
    expect(after?.linked_to).toBeUndefined();
  });

  it("should not auto-link when email is not verified", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    // Create a primary user
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|primary-noverify`,
      email: "noverify@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // Create a secondary user with unverified email
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|secondary-noverify",
      email: "noverify@example.com",
      email_verified: false,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    // Update the email (not email_verified) — email still not verified
    await dataWithHooks.users.update(
      "tenantId",
      "google-oauth2|secondary-noverify",
      { email: "noverify@example.com" },
    );

    // Verify user is NOT linked (email not verified)
    const after = await env.data.users.get(
      "tenantId",
      "google-oauth2|secondary-noverify",
    );
    expect(after?.linked_to).toBeUndefined();
  });

  it("should follow linked_to chain when all matching users are already linked", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    // Create the primary user
    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|chain-primary`,
      email: "chain-update@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // Create a secondary user already linked to primary
    await env.data.users.create("tenantId", {
      user_id: "google-oauth2|chain-secondary",
      email: "chain-update@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      linked_to: `${USERNAME_PASSWORD_PROVIDER}|chain-primary`,
    });

    // Create a third user with different email, unverified
    await env.data.users.create("tenantId", {
      user_id: "facebook|chain-third",
      email: "different@example.com",
      email_verified: false,
      provider: "facebook",
      connection: "facebook",
      is_social: true,
    });

    // Update third user's email to match and verify — all other matches are linked,
    // so the code should follow the chain to find the primary
    await dataWithHooks.users.update("tenantId", "facebook|chain-third", {
      email: "chain-update@example.com",
      email_verified: true,
    });

    // Verify it's linked to the actual primary, not the secondary
    const after = await env.data.users.get("tenantId", "facebook|chain-third");
    expect(after?.linked_to).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|chain-primary`,
    );
  });
});
