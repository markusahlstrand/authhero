import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { LogTypes, User } from "@authhero/adapter-interfaces";
import { postUserLoginHook } from "../../src/hooks";
import { flushBackgroundPromises } from "../../src/helpers/wait-until";
import { Bindings, Variables } from "../../src/types";
import { getTestServer } from "../helpers/test-server";

// The env hook branch only runs with an EnrichedClient + authParams +
// loginSession (that's what buildEnhancedEventObject needs). The shape here
// only has to satisfy the runtime checks on that path.
function makeEnrichedClient() {
  return {
    id: "clientId",
    name: "Test",
    client_id: "clientId",
    tenant: { id: "tenantId" },
    callbacks: ["http://localhost/cb"],
    allowed_logout_urls: [],
    web_origins: [],
    grant_types: ["authorization_code" as const],
    connections: [],
  };
}

function makeUser(userId: string): User {
  return {
    user_id: userId,
    email: `${userId.replace(/[^a-z0-9]/gi, "")}@example.com`,
    email_verified: true,
    provider: "auth2",
    connection: "Username-Password-Authentication",
    is_social: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_ip: "",
    last_login: "",
    login_count: 0,
  };
}

describe("postUserLoginHook → env hooks produce action execution records", () => {
  it("persists an execution for ctx.env.hooks.onExecutePostLogin and links it from the SUCCESS_LOGIN log", async () => {
    const server = await getTestServer();

    const user = makeUser("auth2|env-hook-user");
    await server.env.data.users.create("tenantId", user);

    const loginSession = await server.env.data.loginSessions.create(
      "tenantId",
      {
        csrf_token: "csrf",
        authParams: {
          client_id: "clientId",
          response_type: "code",
          redirect_uri: "http://localhost/cb",
          scope: "openid",
          audience: "https://example.com",
        },
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
    );

    let hookRan = false;

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, server.env);
      ctx.env.hooks = {
        onExecutePostLogin: async () => {
          hookRan = true;
        },
      };
      ctx.set("tenant_id", "tenantId");
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");
      ctx.set("client_id", "clientId");

      await postUserLoginHook(
        ctx,
        server.env.data,
        "tenantId",
        user,
        loginSession,
        {
          client: makeEnrichedClient() as any,
          authParams: loginSession.authParams,
        },
      );

      // Bare Hono app — no outbox middleware, so flush the fire-and-forget log
      // write before responding or the assertions below race it.
      await flushBackgroundPromises(ctx);
      return ctx.json({
        action_execution_id: ctx.var.action_execution_id ?? null,
      });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": "tenantId" } },
      server.env,
    );
    expect(res.status).toBe(200);
    expect(hookRan).toBe(true);

    const body = (await res.json()) as { action_execution_id: string | null };
    expect(body.action_execution_id).toBeTypeOf("string");

    const execution = await server.env.data.actionExecutions.get(
      "tenantId",
      body.action_execution_id!,
    );
    expect(execution).not.toBeNull();
    expect(execution?.trigger_id).toBe("post-login");
    expect(execution?.status).toBe("final");
    expect(execution?.results).toHaveLength(1);
    expect(execution?.results[0]?.action_name).toBe("onExecutePostLogin");
    expect(execution?.results[0]?.error).toBeFalsy();

    const { logs } = await server.env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    const successLogs = logs.filter(
      (log) => log.type === LogTypes.SUCCESS_LOGIN,
    );
    expect(successLogs).toHaveLength(1);
    expect(successLogs[0]?.details).toMatchObject({
      execution_id: body.action_execution_id,
    });
  });

  it("persists the execution even when the env hook redirects", async () => {
    const server = await getTestServer();

    const user = makeUser("auth2|env-redirect-user");
    await server.env.data.users.create("tenantId", user);

    const loginSession = await server.env.data.loginSessions.create(
      "tenantId",
      {
        csrf_token: "csrf",
        authParams: {
          client_id: "clientId",
          response_type: "code",
          redirect_uri: "http://localhost/cb",
          scope: "openid",
          audience: "https://example.com",
        },
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
    );

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, server.env);
      ctx.env.hooks = {
        onExecutePostLogin: async (_event, api) => {
          api.redirect.sendUserTo("https://consent.example.com/step-up");
        },
      };
      ctx.set("tenant_id", "tenantId");
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");
      ctx.set("client_id", "clientId");

      const result = await postUserLoginHook(
        ctx,
        server.env.data,
        "tenantId",
        user,
        loginSession,
        {
          client: makeEnrichedClient() as any,
          authParams: loginSession.authParams,
        },
      );

      await flushBackgroundPromises(ctx);
      return ctx.json({
        redirected:
          result instanceof Response ? result.headers.get("location") : null,
        action_execution_id: ctx.var.action_execution_id ?? null,
      });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": "tenantId" } },
      server.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      redirected: string | null;
      action_execution_id: string | null;
    };
    expect(body.redirected).toContain("https://consent.example.com/step-up");
    // The redirect early-returns out of the hook — the execution record still
    // has to exist, otherwise redirecting env hooks are invisible.
    expect(body.action_execution_id).toBeTypeOf("string");

    const execution = await server.env.data.actionExecutions.get(
      "tenantId",
      body.action_execution_id!,
    );
    expect(execution?.results[0]?.action_name).toBe("onExecutePostLogin");
  });

  it("records a partial execution when the env hook throws, and still rethrows", async () => {
    const server = await getTestServer();

    const user = makeUser("auth2|env-throw-user");
    await server.env.data.users.create("tenantId", user);

    const loginSession = await server.env.data.loginSessions.create(
      "tenantId",
      {
        csrf_token: "csrf",
        authParams: {
          client_id: "clientId",
          response_type: "code",
          redirect_uri: "http://localhost/cb",
          scope: "openid",
          audience: "https://example.com",
        },
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
    );

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, server.env);
      ctx.env.hooks = {
        onExecutePostLogin: async () => {
          throw new Error("env hook blew up");
        },
      };
      ctx.set("tenant_id", "tenantId");
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");
      ctx.set("client_id", "clientId");

      let message: string | null = null;
      try {
        await postUserLoginHook(
          ctx,
          server.env.data,
          "tenantId",
          user,
          loginSession,
          {
            client: makeEnrichedClient() as any,
            authParams: loginSession.authParams,
          },
        );
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }

      await flushBackgroundPromises(ctx);
      return ctx.json({
        message,
        action_execution_id: ctx.var.action_execution_id ?? null,
      });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": "tenantId" } },
      server.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      message: string | null;
      action_execution_id: string | null;
    };
    // The throw must still reach the caller — recording it is additive.
    expect(body.message).toBe("env hook blew up");
    expect(body.action_execution_id).toBeTypeOf("string");

    const execution = await server.env.data.actionExecutions.get(
      "tenantId",
      body.action_execution_id!,
    );
    expect(execution?.status).toBe("partial");
    expect(execution?.results[0]?.error?.msg).toBe("env hook blew up");
  });

  it("persists no execution when no env hook and no code hooks are configured", async () => {
    const server = await getTestServer();

    const user = makeUser("auth2|no-hooks-user");
    await server.env.data.users.create("tenantId", user);

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, server.env);
      ctx.set("tenant_id", "tenantId");
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");

      await postUserLoginHook(ctx, server.env.data, "tenantId", user);
      await flushBackgroundPromises(ctx);
      return ctx.json({
        action_execution_id: ctx.var.action_execution_id ?? null,
      });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": "tenantId" } },
      server.env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { action_execution_id: string | null };
    expect(body.action_execution_id).toBeNull();
  });
});
