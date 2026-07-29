import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { accountLinking } from "../../src/hooks/pre-defined/account-linking";
import type { AccountLinkingOptions } from "../../src/hooks/pre-defined/account-linking";

/**
 * Tests for the opt-in `copyProfileFields` promotion (issues #3/#4, Invariant
 * 4). When enabled, linking fills *absent* root profile fields on the primary
 * from the secondary — fill-if-absent, never overwrite, and never an identifier
 * or verification field. Off by default (Auth0-faithful: a linked identity's
 * own attributes stay under `identities[].profileData`).
 *
 * The `accountLinking` handler picks the OLDEST account as primary. Provider
 * prefixes are chosen so the email identity sorts oldest by the user_id
 * tie-break ("email" < "google-oauth2" < "sms"), making the email row the
 * primary deterministically without fixture timestamps.
 */
describe("accountLinking copyProfileFields promotion", () => {
  const tenantId = "tenantId";

  function mockCtx(data: any): any {
    return {
      env: { data },
      req: { method: "POST", url: "http://test", header: () => tenantId },
      var: { tenant_id: tenantId, ip: "127.0.0.1" },
      get: (key: string) => (key === "ip" ? "127.0.0.1" : undefined),
    };
  }

  function invokeHook(ctx: any, user: any, options?: AccountLinkingOptions) {
    const hook = accountLinking(options);
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

  async function makeEmailPrimary(
    env: any,
    extra: Record<string, unknown> = {},
  ) {
    await env.data.users.create(tenantId, {
      user_id: "email|promo-primary",
      email: "promo@example.com",
      email_verified: true,
      name: "Promo Primary",
      provider: "email",
      connection: "email",
      is_social: false,
      login_count: 0,
      ...extra,
    });
    return env.data.users.get(tenantId, "email|promo-primary");
  }

  it("fills an absent birthdate on the primary from a linked social identity", async () => {
    const { env } = await getTestServer();
    await makeEmailPrimary(env);
    await env.data.users.create(tenantId, {
      user_id: "google-oauth2|promo-social",
      email: "promo@example.com",
      email_verified: true,
      birthdate: "2000-05-05",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
    });
    const social = await env.data.users.get(
      tenantId,
      "google-oauth2|promo-social",
    );

    await invokeHook(mockCtx(env.data), social, { copyProfileFields: true });

    const primary = await env.data.users.get(tenantId, "email|promo-primary");
    expect(primary!.birthdate).toBe("2000-05-05");
    // The link was established (secondary points at the primary).
    const secondary = await env.data.users.get(
      tenantId,
      "google-oauth2|promo-social",
    );
    expect(secondary!.linked_to).toBe("email|promo-primary");
  });

  it("does NOT overwrite a birthdate already set on the primary", async () => {
    const { env } = await getTestServer();
    await makeEmailPrimary(env, { birthdate: "1990-01-01" });
    await env.data.users.create(tenantId, {
      user_id: "google-oauth2|promo-social",
      email: "promo@example.com",
      email_verified: true,
      birthdate: "2000-05-05",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
    });
    const social = await env.data.users.get(
      tenantId,
      "google-oauth2|promo-social",
    );

    await invokeHook(mockCtx(env.data), social, { copyProfileFields: true });

    const primary = await env.data.users.get(tenantId, "email|promo-primary");
    expect(primary!.birthdate).toBe("1990-01-01");
  });

  it("does not promote anything when copyProfileFields is off (Auth0 default)", async () => {
    const { env } = await getTestServer();
    await makeEmailPrimary(env);
    await env.data.users.create(tenantId, {
      user_id: "google-oauth2|promo-social",
      email: "promo@example.com",
      email_verified: true,
      birthdate: "2000-05-05",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
    });
    const social = await env.data.users.get(
      tenantId,
      "google-oauth2|promo-social",
    );

    await invokeHook(mockCtx(env.data), social);

    const primary = await env.data.users.get(tenantId, "email|promo-primary");
    expect(primary!.birthdate).toBeUndefined();
  });

  it("promotes an sms secondary's phone to an email primary that has none, without touching the sms identifier", async () => {
    const { env } = await getTestServer();
    await makeEmailPrimary(env);
    await env.data.users.create(tenantId, {
      user_id: "sms|promo-sms",
      email: "promo@example.com",
      email_verified: true,
      phone_number: "+46700000009",
      provider: "sms",
      connection: "sms",
      is_social: false,
      login_count: 0,
    });
    const sms = await env.data.users.get(tenantId, "sms|promo-sms");

    await invokeHook(mockCtx(env.data), sms, { copyProfileFields: true });

    const primary = await env.data.users.get(tenantId, "email|promo-primary");
    const smsAfter = await env.data.users.get(tenantId, "sms|promo-sms");
    // Primary gains the phone as profile data...
    expect(primary!.phone_number).toBe("+46700000009");
    // ...its email identifier is untouched...
    expect(primary!.email).toBe("promo@example.com");
    // ...and the sms row's identifier phone is never rewritten.
    expect(smsAfter!.phone_number).toBe("+46700000009");
  });

  it("does NOT overwrite a phone the primary already carries", async () => {
    const { env } = await getTestServer();
    await makeEmailPrimary(env, { phone_number: "+46711111111" });
    await env.data.users.create(tenantId, {
      user_id: "sms|promo-sms",
      email: "promo@example.com",
      email_verified: true,
      phone_number: "+46722222222",
      provider: "sms",
      connection: "sms",
      is_social: false,
      login_count: 0,
    });
    const sms = await env.data.users.get(tenantId, "sms|promo-sms");

    await invokeHook(mockCtx(env.data), sms, { copyProfileFields: true });

    const primary = await env.data.users.get(tenantId, "email|promo-primary");
    expect(primary!.phone_number).toBe("+46711111111");
  });
});
