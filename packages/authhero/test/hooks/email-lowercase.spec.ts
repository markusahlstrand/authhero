import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { getTestServer } from "../helpers/test-server";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy } from "@authhero/adapter-interfaces";
import { getOrCreateUserByProvider } from "../../src/helpers/users";
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
// wrapper is the single enforcement point that keeps stored emails lowercase.
describe("email lowercasing at the data-hooks layer", () => {
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
});

// Pre-registration and pre-update hooks both expose `setUserMetadata`, which
// writes arbitrary keys onto the pending payload — including `email`. That runs
// after the adapter wrapper normalized the incoming value, so the decorators
// normalize again just before their commit.
describe("email lowercasing for hook-assigned emails", () => {
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
});
