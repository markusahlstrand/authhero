import { describe, it, expect } from "vitest";
import { Context } from "hono";
import { User } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { handleTemplateHook } from "../../src/hooks/templatehooks";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Bindings, Variables } from "../../src/types";

type HookCtx = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Covers the shared `runTemplateHook` path that both template ids go through:
 * it must build the hook event, run the pre-defined hook and return the
 * re-fetched user rather than the one it was handed.
 */
describe("handleTemplateHook", () => {
  const tenantId = "tenantId";

  // A partial context is enough — the template hooks reach for `env.data`,
  // the request basics and the `ip` / `useragent` vars. `env.data` is wrapped
  // in the data hooks against this same context, which is what the real
  // request path does.
  function mockCtx(
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
    varOverrides: Record<string, unknown> = {},
  ): HookCtx {
    const vars: Record<string, unknown> = {
      tenant_id: tenantId,
      ip: "127.0.0.1",
      useragent: "test-agent",
      ...varOverrides,
    };
    const ctx: Partial<HookCtx> = {
      req: {
        method: "POST",
        url: "http://test",
        path: "/test",
        header: () => undefined,
      } as unknown as HookCtx["req"],
      var: vars as HookCtx["var"],
      get: ((key: string) => vars[key]) as HookCtx["get"],
    };
    const typedCtx = ctx as HookCtx;
    typedCtx.env = {
      ...env,
      data: addDataHooks(typedCtx, env.data),
    } as HookCtx["env"];
    return typedCtx;
  }

  async function seedSecondary(
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
    userId: string,
  ): Promise<User> {
    await env.data.users.create(tenantId, {
      user_id: userId,
      email: "foo@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: "Username-Password-Authentication",
      is_social: false,
    });
    const user = await env.data.users.get(tenantId, userId);
    expect(user).toBeTruthy();
    return user!;
  }

  it("runs the account-linking template and returns the re-fetched user", async () => {
    const { env } = await getTestServer();
    const user = await seedSecondary(
      env,
      `${USERNAME_PASSWORD_PROVIDER}|template-link`,
    );
    expect(user.linked_to).toBeFalsy();

    const ctx = mockCtx(env);

    const result = await handleTemplateHook(
      ctx,
      "account-linking",
      user,
      undefined,
    );

    // The hook writes linked_to through the adapter; the returned user must
    // reflect that write, not the stale input.
    expect(result.linked_to).toBe("email|userId");
  });

  it("runs the ensure-username template and returns the re-fetched user", async () => {
    const { env } = await getTestServer();
    const user = await seedSecondary(
      env,
      `${USERNAME_PASSWORD_PROVIDER}|template-username`,
    );

    const ctx = mockCtx(env);

    const result = await handleTemplateHook(
      ctx,
      "ensure-username",
      user,
      undefined,
    );

    expect(result.user_id).toBe(user.user_id);
  });

  it("returns the user untouched for an unknown template id", async () => {
    const { env } = await getTestServer();
    const user = await seedSecondary(
      env,
      `${USERNAME_PASSWORD_PROVIDER}|template-unknown`,
    );

    const ctx = mockCtx(env);
    const result = await handleTemplateHook(ctx, "no-such-template", user);

    expect(result).toBe(user);
  });

  it("returns the user untouched when no tenant can be resolved", async () => {
    const { env } = await getTestServer();
    const user = await seedSecondary(
      env,
      `${USERNAME_PASSWORD_PROVIDER}|template-no-tenant`,
    );

    const ctx = mockCtx(env, { tenant_id: undefined });
    const result = await handleTemplateHook(ctx, "account-linking", user);

    expect(result).toBe(user);
  });
});
