import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

/**
 * Covers the new `userLinkingMode` toggle (service-level + per-client) and
 * the `account-linking` template hook running at the new triggers
 * `post-user-registration` and `post-user-update`.
 */

function mockCtx(env: any, overrides: any = {}): any {
  return {
    req: {
      method: "POST",
      url: "http://test",
      path: "/test",
      header: () => undefined,
      queries: () => ({}),
      query: () => undefined,
    },
    env,
    var: {
      ip: "127.0.0.1",
      useragent: "test-agent",
      client_id: overrides.client_id,
      tenant_id: "tenantId",
    },
    get: (key: string) => (key === "ip" ? "127.0.0.1" : undefined),
  };
}

describe("userLinkingMode service-level toggle", () => {
  it("'off' skips the built-in email-based auto-link at user creation", async () => {
    const { env } = await getTestServer();

    // Service-level `userLinkingMode: "off"` — built-in linking disabled.
    env.userLinkingMode = "off";

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    // The fixture seeds a primary `email|userId` with foo@example.com (verified).
    // With built-in linking off, creating a second verified user with the same
    // email must NOT auto-link.
    const newId = `${USERNAME_PASSWORD_PROVIDER}|no-auto-link`;
    await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
    });

    const after = await env.data.users.get("tenantId", newId);
    expect(after?.linked_to).toBeFalsy();
  });

  it("'builtin' (default) keeps the built-in email-based auto-link at user creation", async () => {
    const { env } = await getTestServer();
    // No userLinkingMode set — defaults to "builtin".

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    const newId = `${USERNAME_PASSWORD_PROVIDER}|legacy-link`;
    const result = await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
    });

    // The legacy path returns the primary (with merged identities).
    expect(result.user_id).toBe("email|userId");
    const secondary = await env.data.users.get("tenantId", newId);
    expect(secondary?.linked_to).toBe("email|userId");
  });
});

describe("per-client user_linking_mode override", () => {
  it("'off' on the calling client disables linking even when service default is 'builtin'", async () => {
    const { env } = await getTestServer();

    // Mark the seeded test client as opt-out.
    await env.data.clients.update("tenantId", "clientId", {
      user_linking_mode: "off",
    });

    const ctx = mockCtx(env, { client_id: "clientId" });
    const dataWithHooks = addDataHooks(ctx, env.data);

    const newId = `${USERNAME_PASSWORD_PROVIDER}|client-opt-out`;
    await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
    });

    const after = await env.data.users.get("tenantId", newId);
    expect(after?.linked_to).toBeFalsy();
  });

  it("'builtin' on the calling client overrides service-level 'off'", async () => {
    const { env } = await getTestServer();

    env.userLinkingMode = "off";
    await env.data.clients.update("tenantId", "clientId", {
      user_linking_mode: "builtin",
    });

    const ctx = mockCtx(env, { client_id: "clientId" });
    const dataWithHooks = addDataHooks(ctx, env.data);

    const newId = `${USERNAME_PASSWORD_PROVIDER}|client-opt-in`;
    const result = await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
    });

    // Linking applied → primary returned, secondary linked_to set.
    expect(result.user_id).toBe("email|userId");
    const secondary = await env.data.users.get("tenantId", newId);
    expect(secondary?.linked_to).toBe("email|userId");
  });
});

describe("account-linking template hook at post-user-registration", () => {
  it("links the new user to the existing primary when the template is enabled and built-in is off", async () => {
    const { env } = await getTestServer();
    env.userLinkingMode = "off";

    // Enable the template hook for post-user-registration.
    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-registration",
      template_id: "account-linking",
      enabled: true,
    });

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    const newId = `${USERNAME_PASSWORD_PROVIDER}|template-link`;
    await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
    });

    const after = await env.data.users.get("tenantId", newId);
    expect(after?.linked_to).toBe("email|userId");
  });

  it("disabled template + 'off' mode = no linking at all", async () => {
    const { env } = await getTestServer();
    env.userLinkingMode = "off";

    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-registration",
      template_id: "account-linking",
      enabled: false,
    });

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    const newId = `${USERNAME_PASSWORD_PROVIDER}|no-link`;
    await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
    });

    const after = await env.data.users.get("tenantId", newId);
    expect(after?.linked_to).toBeFalsy();
  });
});

describe("account-linking template hook with copy_user_metadata", () => {
  it("merges secondary user_metadata into the primary on link, primary winning on conflict", async () => {
    const { env } = await getTestServer();
    env.userLinkingMode = "off";

    // Seed the primary with some existing user_metadata.
    await env.data.users.update("tenantId", "email|userId", {
      user_metadata: { theme: "dark", referrer: "primary" } as any,
    });

    // Enable the template at post-user-registration with copy_user_metadata.
    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-registration",
      template_id: "account-linking",
      enabled: true,
      metadata: { copy_user_metadata: true },
    });

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    const newId = `${USERNAME_PASSWORD_PROVIDER}|merge-meta`;
    await dataWithHooks.users.create("tenantId", {
      user_id: newId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
      // Secondary brings a new key + a conflicting one.
      user_metadata: { plan: "pro", referrer: "secondary" } as any,
    });

    const primary = await env.data.users.get("tenantId", "email|userId");
    // Conflicting key kept primary's value, new key from secondary copied in.
    expect(primary?.user_metadata).toEqual({
      theme: "dark",
      referrer: "primary",
      plan: "pro",
    });
  });

  it("does not copy user_metadata when copy_user_metadata is unset", async () => {
    const { env } = await getTestServer();
    env.userLinkingMode = "off";

    await env.data.users.update("tenantId", "email|userId", {
      user_metadata: { theme: "dark" } as any,
    });

    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-registration",
      template_id: "account-linking",
      enabled: true,
      // No metadata.copy_user_metadata
    });

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    await dataWithHooks.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|no-merge`,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      is_social: false,
      login_count: 0,
      user_metadata: { plan: "pro" } as any,
    });

    const primary = await env.data.users.get("tenantId", "email|userId");
    expect(primary?.user_metadata).toEqual({ theme: "dark" });
  });
});

describe("account-linking template hook at post-user-update", () => {
  it("links a user to an existing primary when their email becomes verified and the template is enabled", async () => {
    const { env } = await getTestServer();
    env.userLinkingMode = "off";

    // Enable the template at post-user-update.
    await env.data.hooks.create("tenantId", {
      trigger_id: "post-user-update",
      template_id: "account-linking",
      enabled: true,
    });

    // Create a secondary user with an unverified email matching the primary.
    const secondaryId = "google-oauth2|secondary-verify";
    await env.data.users.create("tenantId", {
      user_id: secondaryId,
      email: "foo@example.com",
      email_verified: false,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    expect(
      (await env.data.users.get("tenantId", secondaryId))?.linked_to,
    ).toBeFalsy();

    const ctx = mockCtx(env);
    const dataWithHooks = addDataHooks(ctx, env.data);

    // Verify the email — built-in is off so only the template should link.
    await dataWithHooks.users.update("tenantId", secondaryId, {
      email_verified: true,
    });

    const after = await env.data.users.get("tenantId", secondaryId);
    expect(after?.linked_to).toBe("email|userId");
  });
});
