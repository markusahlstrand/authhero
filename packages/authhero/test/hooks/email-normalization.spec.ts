import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { getTestServer } from "../helpers/test-server";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";
import { getOrCreateUserByProvider } from "../../src/helpers/users";
import { resolveLinkCandidates } from "../../src/helpers/link-candidates";
import { commitUserHook } from "../../src/hooks/link-users";
import { getEnrichedClient } from "../../src/helpers/client";
import { Bindings, Variables } from "../../src/types";
import {
  HookEvent,
  Hooks,
  OnExecutePreUserRegistrationAPI,
  OnExecutePreUserUpdateAPI,
} from "../../src/types/Hooks";

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];
type HookContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * The hook decorators read only the handful of context members below. The
 * single cast keeps that narrow shape at the fixture boundary instead of
 * spreading `any` through every call site.
 */
function createMockCtx(env: TestEnv, hooks?: Hooks): HookContext {
  const ctx = {
    req: {
      method: "POST",
      url: "http://test",
      path: "/test",
      header: () => undefined,
      query: () => undefined,
      queries: () => ({}),
    },
    // `getTestServer` hands its `hooks` to `init()`, which attaches them to
    // `ctx.env` inside the app middleware — the returned `env` has none. These
    // tests drive the decorators directly, so attach them here.
    env: hooks ? { ...env, hooks } : env,
    set: () => {},
    var: {
      ip: "127.0.0.1",
      useragent: "test-agent",
      auth0_client: undefined,
      body: undefined,
      client_id: "test-client",
    },
  };

  return ctx as unknown as HookContext;
}

// Emails sourced from upstream systems (SCIM payloads, Auth0 lazy migration,
// IdP profiles) bypass the zod request-schema transforms, so the addDataHooks
// wrapper is the single enforcement point that keeps stored emails normalized
// — trimmed as well as lowercased (issue #1279).
describe("email normalization at the data-hooks layer", () => {
  it("lowercases the email on users.create", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    const created = await dataWithHooks.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|mixed-case-create`,
      email: "John.Doe@Example.COM",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    expect(created.email).toBe("john.doe@example.com");

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|mixed-case-create`,
    );
    expect(stored?.email).toBe("john.doe@example.com");
  });

  it("lowercases the email on users.update", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|mixed-case-update`,
      email: "before@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    await dataWithHooks.users.update(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|mixed-case-update`,
      { email: "After.Change@Example.COM" },
    );

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|mixed-case-update`,
    );
    expect(stored?.email).toBe("after.change@example.com");
  });

  it("trims surrounding whitespace off the email on users.create", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    const created = await dataWithHooks.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|padded-create`,
      email: "  Padded.User@Example.COM  ",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    expect(created.email).toBe("padded.user@example.com");

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|padded-create`,
    );
    expect(stored?.email).toBe("padded.user@example.com");
  });

  it("trims tabs and newlines off the email on users.create", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    const created = await dataWithHooks.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|whitespace-create`,
      email: "\tWhitespace@Example.com\n",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    expect(created.email).toBe("whitespace@example.com");
  });

  it("trims surrounding whitespace off the email on users.update", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|padded-update`,
      email: "before@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    await dataWithHooks.users.update(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|padded-update`,
      { email: " After.Padded@Example.COM " },
    );

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|padded-update`,
    );
    expect(stored?.email).toBe("after.padded@example.com");
  });

  // The bug this file guards: a padded address used to survive to the store and
  // then look like a different identifier from its trimmed twin, so every
  // uniqueness check and every lookup saw two accounts for the same person.
  it("makes a padded-on-the-way-in email findable by its trimmed form", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    await dataWithHooks.users.create("tenantId", {
      user_id: "email|padded-twin",
      email: "twin@example.com ",
      email_verified: true,
      provider: "email",
      connection: "email",
    });

    const { users } = await env.data.users.list("tenantId", {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: "email:twin@example.com",
    });

    expect(users.map((u) => u.user_id)).toContain("email|padded-twin");
  });
});

// Pre-registration and pre-update hooks both expose `setUserMetadata`, which
// writes arbitrary keys onto the pending payload — including `email`. That runs
// after the adapter wrapper normalized the incoming value, so the decorators
// normalize again just before their commit.
describe("email normalization for hook-assigned emails", () => {
  it("lowercases an email assigned by a pre-registration hook", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(
      createMockCtx(env, {
        onExecutePreUserRegistration: async (
          _event: HookEvent,
          api: OnExecutePreUserRegistrationAPI,
        ) => {
          api.user.setUserMetadata("email", "Hook.Assigned@Example.COM");
        },
      }),
      env.data,
    );

    const created = await dataWithHooks.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|hook-create`,
      email: "original@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    expect(created.email).toBe("hook.assigned@example.com");

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|hook-create`,
    );
    expect(stored?.email).toBe("hook.assigned@example.com");
  });

  it("lowercases an email assigned by a pre-update hook", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(
      createMockCtx(env, {
        onExecutePreUserUpdate: async (
          _event: HookEvent,
          api: OnExecutePreUserUpdateAPI,
        ) => {
          api.user.setUserMetadata("email", "Hook.Updated@Example.COM");
        },
      }),
      env.data,
    );

    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|hook-update`,
      email: "before@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    await dataWithHooks.users.update(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|hook-update`,
      { name: "Unrelated change" },
    );

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|hook-update`,
    );
    expect(stored?.email).toBe("hook.updated@example.com");
  });

  it("trims an email assigned by a pre-registration hook", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(
      createMockCtx(env, {
        onExecutePreUserRegistration: async (
          _event: HookEvent,
          api: OnExecutePreUserRegistrationAPI,
        ) => {
          api.user.setUserMetadata("email", "  Hook.Padded@Example.COM  ");
        },
      }),
      env.data,
    );

    const created = await dataWithHooks.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|hook-padded-create`,
      email: "original@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    expect(created.email).toBe("hook.padded@example.com");

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|hook-padded-create`,
    );
    expect(stored?.email).toBe("hook.padded@example.com");
  });

  it("trims an email assigned by a pre-update hook", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(
      createMockCtx(env, {
        onExecutePreUserUpdate: async (
          _event: HookEvent,
          api: OnExecutePreUserUpdateAPI,
        ) => {
          api.user.setUserMetadata("email", " Hook.Padded.Update@Example.COM ");
        },
      }),
      env.data,
    );

    await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|hook-padded-update`,
      email: "before@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    await dataWithHooks.users.update(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|hook-padded-update`,
      { name: "Unrelated change" },
    );

    const stored = await env.data.users.get(
      "tenantId",
      `${USERNAME_PASSWORD_PROVIDER}|hook-padded-update`,
    );
    expect(stored?.email).toBe("hook.padded.update@example.com");
  });
});

// Every lazy "find-or-create by identifier" flow (password reset, ticket
// exchange, refresh-token migration, passwordless, social callback) funnels
// through getOrCreateUserByProvider, and several hand it
// `loginSession.authParams.username` — which carries `login_hint` from
// /authorize unnormalized.
describe("getOrCreateUserByProvider identifier normalization", () => {
  it("matches an existing user despite mixed-case input instead of duplicating", async () => {
    const { env } = await getTestServer();
    const ctx = createMockCtx(env);
    const client = await getEnrichedClient(env, "clientId", "tenantId");

    const existing = await env.data.users.create("tenantId", {
      user_id: "email|lazy-existing",
      email: "lazy@example.com",
      email_verified: true,
      provider: "email",
      connection: "email",
    });

    const resolved = await getOrCreateUserByProvider(ctx, {
      client,
      username: "LAZY@Example.COM",
      provider: "email",
      connection: "email",
      isSocial: false,
    });

    expect(resolved.user_id).toBe(existing.user_id);
    expect(resolved.email).toBe("lazy@example.com");
  });

  it("stores a lowercase email when it does create the user", async () => {
    const { env } = await getTestServer();
    const ctx = createMockCtx(env);
    const client = await getEnrichedClient(env, "clientId", "tenantId");

    const created = await getOrCreateUserByProvider(ctx, {
      client,
      username: "Fresh.User@Example.COM",
      provider: "email",
      connection: "email",
      isSocial: false,
    });

    expect(created.email).toBe("fresh.user@example.com");
  });

  it("leaves a phone-number identifier untouched", async () => {
    const { env } = await getTestServer();
    const ctx = createMockCtx(env);
    const client = await getEnrichedClient(env, "clientId", "tenantId");

    const created = await getOrCreateUserByProvider(ctx, {
      client,
      username: "+46700000123",
      provider: "sms",
      connection: "sms",
      isSocial: false,
    });

    expect(created.phone_number).toBe("+46700000123");
    expect(created.email).toBeFalsy();
  });

  it("matches an existing user despite a padded identifier instead of duplicating", async () => {
    const { env } = await getTestServer();
    const ctx = createMockCtx(env);
    const client = await getEnrichedClient(env, "clientId", "tenantId");

    const existing = await env.data.users.create("tenantId", {
      user_id: "email|lazy-padded-existing",
      email: "padded-lazy@example.com",
      email_verified: true,
      provider: "email",
      connection: "email",
    });

    const resolved = await getOrCreateUserByProvider(ctx, {
      client,
      username: "  Padded-Lazy@Example.COM  ",
      provider: "email",
      connection: "email",
      isSocial: false,
    });

    expect(resolved.user_id).toBe(existing.user_id);
    expect(resolved.email).toBe("padded-lazy@example.com");
  });

  it("stores a trimmed email when it does create the user", async () => {
    const { env } = await getTestServer();
    const ctx = createMockCtx(env);
    const client = await getEnrichedClient(env, "clientId", "tenantId");

    const created = await getOrCreateUserByProvider(ctx, {
      client,
      username: " Padded.Fresh@Example.COM ",
      provider: "email",
      connection: "email",
      isSocial: false,
    });

    expect(created.email).toBe("padded.fresh@example.com");
    // `name` falls back to the identifier, so it must carry the normalized
    // value too rather than re-introducing the whitespace on the profile.
    expect(created.name).toBe("padded.fresh@example.com");
  });
});

// Auto-linking keys on the normalized email. A padded address used to key
// differently from its trimmed twin, so the two accounts were never merged and
// the older one's history was stranded (issue #1279).
describe("account linking with padded emails", () => {
  // Driven through `commitUserHook` directly, the way account-linking.spec.ts
  // does, to exercise the in-transaction email→primary lookup on its own.
  // That lookup is below the normalizing adapter wrapper, so what it proves is
  // the read-side half of the fix: a padded address still resolves its primary.
  it("resolves the trimmed-email primary for a padded email", async () => {
    const { env } = await getTestServer();

    const primary = await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|link-primary`,
      email: "linkme@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    await commitUserHook(env.data)(
      "tenantId",
      {
        user_id: "google-oauth2|link-padded",
        email: "  LinkMe@Example.COM  ",
        email_verified: true,
        provider: "google-oauth2",
        connection: "google-oauth2",
        is_social: true,
      },
      { resolveEmailLinkedPrimary: true },
    );

    const secondary = await env.data.users.get(
      "tenantId",
      "google-oauth2|link-padded",
    );
    expect(secondary?.linked_to).toBe(primary.user_id);
  });

  // The same case end-to-end through the decorated adapter, which is how every
  // real caller reaches it: the padded email is normalized on the way in *and*
  // the row lands on the existing primary rather than becoming a duplicate.
  it("normalizes and links a padded email through the decorated adapter", async () => {
    const { env } = await getTestServer();
    const dataWithHooks = addDataHooks(createMockCtx(env), env.data);

    const primary = await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|decorated-primary`,
      email: "decorated@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    await dataWithHooks.users.create("tenantId", {
      user_id: "google-oauth2|decorated-padded",
      email: "  Decorated@Example.COM  ",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    const secondary = await env.data.users.get(
      "tenantId",
      "google-oauth2|decorated-padded",
    );
    expect(secondary?.email).toBe("decorated@example.com");
    expect(secondary?.linked_to).toBe(primary.user_id);
  });

  it("surfaces the trimmed-email primary as a link candidate for a padded email", async () => {
    const { env } = await getTestServer();

    const primary = await env.data.users.create("tenantId", {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|candidate-primary`,
      email: "candidate@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
    });

    // A row that predates the fix: stored with the whitespace still on it.
    const dirty = await env.data.users.create("tenantId", {
      user_id: "google-oauth2|candidate-dirty",
      email: "candidate@example.com ",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
    });

    const candidates = await resolveLinkCandidates({
      userAdapter: env.data.users,
      tenantId: "tenantId",
      user: dirty,
    });

    expect(candidates.map((c) => c.user_id)).toEqual([primary.user_id]);
  });
});
