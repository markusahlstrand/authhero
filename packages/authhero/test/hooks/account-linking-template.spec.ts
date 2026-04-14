import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { accountLinking } from "../../src/hooks/pre-defined/account-linking";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";

/**
 * Integration tests for the `accountLinking` pre-defined post-login hook
 * (enabled per-tenant via `template_id: "account-linking"`).
 *
 * These drive the hook against a real in-memory kysely adapter via the test
 * server so the `getPrimaryUserByEmail` query path + `users.update` round-trip
 * exercise the real storage layer.
 */
describe("accountLinking pre-defined hook", () => {
  const tenantId = "tenantId";

  // The test server fixture already creates `email|userId` with
  // foo@example.com (email_verified: true). We'll use that as the primary
  // and create a secondary account with the same email to test linking.
  function mockCtx(data: any): any {
    return {
      env: { data },
      req: { method: "POST", url: "http://test", path: "/test", header: () => tenantId },
      var: { tenant_id: tenantId, ip: "127.0.0.1" },
      get: (key: string) => (key === "ip" ? "127.0.0.1" : undefined),
    };
  }

  function invokeHook(ctx: any, user: any) {
    const hook = accountLinking();
    return hook(
      {
        ctx,
        user,
        tenant: { id: tenantId },
        request: { ip: "127.0.0.1", url: "http://test" },
      } as any,
      {
        prompt: { render: () => {} },
        redirect: {
          sendUserTo: () => {},
          encodeToken: () => "",
          validateToken: () => null,
        },
        token: { createServiceToken: async () => "" },
      } as any,
    );
  }

  it("links a new password account to an existing email primary with the same verified email", async () => {
    const { env } = await getTestServer();
    // The test server seeds email|userId with foo@example.com (verified). The
    // raw env.data bypasses addDataHooks, so create does NOT auto-link here.
    const passwordUserId = `${USERNAME_PASSWORD_PROVIDER}|new-user`;
    await env.data.users.create(tenantId, {
      user_id: passwordUserId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Username-Password-Authentication",
      is_social: false,
      login_count: 0,
    });

    const before = await env.data.users.get(tenantId, passwordUserId);
    expect(before?.linked_to).toBeFalsy();

    const ctx = mockCtx(addDataHooks({} as any, env.data));
    await invokeHook(ctx, before);

    const after = await env.data.users.get(tenantId, passwordUserId);
    expect(after?.user_id).toBe(passwordUserId);
    expect(after?.linked_to).toBe("email|userId");

    // And the primary's identities list should include the newly-linked one.
    const primary = await env.data.users.get(tenantId, "email|userId");
    const providers = primary?.identities?.map((i: any) => i.provider) ?? [];
    expect(providers).toContain(USERNAME_PASSWORD_PROVIDER);
  });

  it("does nothing when linked_to is already set", async () => {
    const { env } = await getTestServer();
    const secondaryId = `${USERNAME_PASSWORD_PROVIDER}|already-linked`;
    await env.data.users.create(tenantId, {
      user_id: secondaryId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Username-Password-Authentication",
      is_social: false,
      linked_to: "email|userId",
      login_count: 0,
    });

    const secondary = await env.data.users.get(tenantId, secondaryId);

    const ctx = mockCtx(addDataHooks({} as any, env.data));
    await invokeHook(ctx, { ...secondary, linked_to: "email|userId" });

    // linked_to should still point at the original primary — no change.
    const stillLinked = await env.data.users.list(tenantId, {
      q: `linked_to:email|userId`,
    });
    expect(stillLinked.users.some((u) => u.user_id === secondaryId)).toBe(true);
  });

  it("does nothing when email is not verified (by default)", async () => {
    const { env } = await getTestServer();
    const unverifiedId = `${USERNAME_PASSWORD_PROVIDER}|unverified`;
    await env.data.users.create(tenantId, {
      user_id: unverifiedId,
      email: "foo@example.com",
      email_verified: false,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Username-Password-Authentication",
      is_social: false,
      login_count: 0,
    });

    const unverified = await env.data.users.get(tenantId, unverifiedId);

    const ctx = mockCtx(addDataHooks({} as any, env.data));
    await invokeHook(ctx, unverified);

    const after = await env.data.users.get(tenantId, unverifiedId);
    expect(after?.linked_to).toBeFalsy();
  });

  it("is a no-op when the user is themselves the only primary with that email", async () => {
    const { env } = await getTestServer();
    // The fixture's email|userId has foo@example.com and is a primary. Running
    // the hook against it should not set linked_to on itself.
    const primary = await env.data.users.get(tenantId, "email|userId");

    const ctx = mockCtx(addDataHooks({} as any, env.data));
    await invokeHook(ctx, primary);

    const after = await env.data.users.get(tenantId, "email|userId");
    expect(after?.linked_to).toBeFalsy();
    expect(after?.user_id).toBe("email|userId");
  });
});
