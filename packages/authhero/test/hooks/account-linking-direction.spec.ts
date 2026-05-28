import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { addDataHooks } from "../../src/hooks";
import { accountLinking } from "../../src/hooks/pre-defined/account-linking";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";

/**
 * Regression tests for the link-direction bug: when two unlinked users
 * share an email, the older account must remain primary regardless of
 * which side triggers the link. Previously the "current user being
 * processed" was always treated as the secondary, so updating the
 * older user's email (or running the post-login template hook against
 * the older user) could demote it to a secondary of the newer duplicate.
 */

const tenantId = "tenantId";

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
    get: (key: string) => (key === "ip" ? "127.0.0.1" : undefined),
  };
}

describe("account-linking direction", () => {
  it("user-update auto-link: older user stays primary when its email is updated to match a newer user", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    // OLDER password user with a distinct email.
    const olderId = `${USERNAME_PASSWORD_PROVIDER}|older`;
    await env.data.users.create(tenantId, {
      user_id: olderId,
      email: "older@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    });

    // NEWER google user with the target email.
    const newerId = "google-oauth2|newer";
    await env.data.users.create(tenantId, {
      user_id: newerId,
      email: "shared@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
      updated_at: "2025-06-01T00:00:00.000Z",
    });

    // Trigger linking from the OLDER user's side by updating its email.
    await dataWithHooks.users.update(tenantId, olderId, {
      email: "shared@example.com",
    });

    const older = await env.data.users.get(tenantId, olderId);
    const newer = await env.data.users.get(tenantId, newerId);

    expect(older?.linked_to).toBeFalsy();
    expect(newer?.linked_to).toBe(olderId);
  });

  it("user-update auto-link: newer user is demoted to existing older primary (existing direction)", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    const olderId = `${USERNAME_PASSWORD_PROVIDER}|older2`;
    await env.data.users.create(tenantId, {
      user_id: olderId,
      email: "shared2@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    });

    const newerId = "google-oauth2|newer2";
    await env.data.users.create(tenantId, {
      user_id: newerId,
      email: "different2@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
      updated_at: "2025-06-01T00:00:00.000Z",
    });

    // Trigger linking from the NEWER user's side.
    await dataWithHooks.users.update(tenantId, newerId, {
      email: "shared2@example.com",
    });

    const older = await env.data.users.get(tenantId, olderId);
    const newer = await env.data.users.get(tenantId, newerId);

    expect(older?.linked_to).toBeFalsy();
    expect(newer?.linked_to).toBe(olderId);
  });

  it("user-update auto-link: when the older user is updated, the newer primary's existing secondaries are repointed too", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    const olderId = `${USERNAME_PASSWORD_PROVIDER}|older3`;
    await env.data.users.create(tenantId, {
      user_id: olderId,
      email: "older3@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    });

    const newerPrimaryId = "google-oauth2|newer3";
    await env.data.users.create(tenantId, {
      user_id: newerPrimaryId,
      email: "shared3@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
      updated_at: "2025-06-01T00:00:00.000Z",
    });

    // A pre-existing secondary of the newer primary. After repoint it
    // must point at the older primary so the graph stays 1-deep.
    const newerSecondaryId = "facebook|newer3-secondary";
    await env.data.users.create(tenantId, {
      user_id: newerSecondaryId,
      email: "shared3@example.com",
      email_verified: true,
      provider: "facebook",
      connection: "facebook",
      is_social: true,
      linked_to: newerPrimaryId,
      created_at: "2025-07-01T00:00:00.000Z",
      updated_at: "2025-07-01T00:00:00.000Z",
    });

    await dataWithHooks.users.update(tenantId, olderId, {
      email: "shared3@example.com",
    });

    const older = await env.data.users.get(tenantId, olderId);
    const newerPrimary = await env.data.users.get(tenantId, newerPrimaryId);
    const newerSecondary = await env.data.users.get(
      tenantId,
      newerSecondaryId,
    );

    expect(older?.linked_to).toBeFalsy();
    expect(newerPrimary?.linked_to).toBe(olderId);
    expect(newerSecondary?.linked_to).toBe(olderId);
  });

  it("accountLinking template hook: older user logging in keeps primary, newer duplicate is demoted", async () => {
    const { env } = await getTestServer();

    // Existing seeded user `email|userId` has created_at from the fixture
    // (recent — i.e. it will look "newer" than the one we create below).
    // Insert an OLDER user with the same email.
    const olderId = `${USERNAME_PASSWORD_PROVIDER}|template-older`;
    await env.data.users.create(tenantId, {
      user_id: olderId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
    });

    const olderUser = await env.data.users.get(tenantId, olderId);
    expect(olderUser?.linked_to).toBeFalsy();

    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);
    const ctx: any = {
      env: { data: dataWithHooks },
      req: {
        method: "POST",
        url: "http://test",
        path: "/test",
        header: () => tenantId,
      },
      var: { tenant_id: tenantId, ip: "127.0.0.1" },
      get: (key: string) => (key === "ip" ? "127.0.0.1" : undefined),
    };

    const hook = accountLinking();
    await hook(
      {
        ctx,
        user: olderUser,
        tenant: { id: tenantId },
        request: { ip: "127.0.0.1", url: "http://test" },
      } as any,
      {} as any,
    );

    const older = await env.data.users.get(tenantId, olderId);
    const seeded = await env.data.users.get(tenantId, "email|userId");

    expect(older?.linked_to).toBeFalsy();
    expect(seeded?.linked_to).toBe(olderId);
  });
});
