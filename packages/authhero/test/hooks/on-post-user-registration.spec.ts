import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { HookEvent } from "../../src/types/Hooks";
import { testClient } from "hono/testing";
import { getAdminToken } from "../helpers/token";
import { Strategy } from "@authhero/adapter-interfaces";
import { addDataHooks } from "../../src/hooks";

describe("on-post-user-registration-hook", () => {
  it("should trigger an event", async () => {
    const events: HookEvent[] = [];

    const { env, managementApp } = await getTestServer({
      hooks: {
        onExecutePostUserRegistration: async (event: HookEvent) => {
          events.push(event);
        },
      },
    });

    const client = testClient(managementApp, env);

    const token = await getAdminToken();

    // Create a user via Management API
    const userResponse = await client.users.$post(
      {
        json: {
          email: "foo2@example.com",
          connection: Strategy.USERNAME_PASSWORD,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(userResponse.status).toBe(201);

    // The hook should fire once when the user is created
    expect(events.length).toBe(1);
    expect(events[0]?.user.email).toBe("foo2@example.com");
  });

  it("should fire only once when two creates race for the same user_id", async () => {
    const events: HookEvent[] = [];

    const hooks = {
      onExecutePostUserRegistration: async (event: HookEvent) => {
        events.push(event);
      },
    };

    const { env } = await getTestServer({ hooks });

    const mockCtx: any = {
      req: {
        method: "POST",
        url: "http://test",
        path: "/test",
        header: () => undefined,
        query: () => undefined,
        queries: () => ({}),
      },
      // applyConfigMiddleware normally merges hooks into ctx.env during a
      // real request; inject it directly since this test bypasses the app.
      env: { ...env, hooks },
      var: {
        ip: "127.0.0.1",
        useragent: "test-agent",
        auth0_client: undefined,
        body: undefined,
        client_id: "clientId",
        tenant_id: "tenantId",
      },
      set: () => {},
    };

    const dataWithHooks = addDataHooks(mockCtx, env.data);

    const userPayload = {
      user_id: "vipps|shared-sub",
      email: "racer@example.com",
      email_verified: true,
      provider: "vipps",
      connection: "vipps",
      is_social: true,
    };

    // Race-winner: the first create inserts the row and should fire the hook.
    await dataWithHooks.users.create("tenantId", userPayload);

    // Race-loser: a concurrent request with the same user_id. createUserHooks
    // must surface this as 409 so strict management-API callers error out; the
    // social-callback caller catches the 409 in getOrCreateUserByProvider.
    await expect(
      dataWithHooks.users.create("tenantId", userPayload),
    ).rejects.toMatchObject({ status: 409 });

    // Crucially, the race-loser must not re-fire the post-registration hook —
    // that was the production bug producing duplicate outbox events.
    expect(events.length).toBe(1);
  });
});
