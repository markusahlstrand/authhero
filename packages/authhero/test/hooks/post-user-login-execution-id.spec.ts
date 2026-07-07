import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  CodeExecutor,
  LogTypes,
  Strategy,
  User,
} from "@authhero/adapter-interfaces";
import { postUserLoginHook } from "../../src/hooks";
import { flushBackgroundPromises } from "../../src/helpers/wait-until";
import { Bindings, Variables } from "../../src/types";
import { getTestServer } from "../helpers/test-server";

// Code hooks need an EnrichedClient + authParams + loginSession before
// persistActionExecution runs (see post-user-login.ts ~line 412). The shapes
// here only need to satisfy the runtime checks for that branch.
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

describe("postUserLoginHook → SUCCESS_LOGIN log carries details.execution_id", () => {
  it("embeds the action_execution_id on the SUCCESS_LOGIN log when a code hook ran", async () => {
    // Always-succeeding executor so persistActionExecution writes a "final"
    // execution and returns an id. The id is what we expect to see in details.
    const codeExecutor: CodeExecutor = {
      async execute() {
        return {
          success: true,
          durationMs: 1,
          apiCalls: [],
          logs: [{ level: "log", message: "hello from action" }],
        };
      },
    };
    const server = await getTestServer({ codeExecutor });

    // Provision: action holding code + a hook binding it to post-user-login.
    const action = await server.env.data.actions.create("tenantId", {
      name: "test-action",
      code: "exports.onExecutePostLogin = async () => {};",
    });
    await server.env.data.hooks.create("tenantId", {
      trigger_id: "post-user-login",
      enabled: true,
      code_id: action.id,
      synchronous: true,
    });

    const user: User = {
      user_id: "auth2|test-user",
      email: "test@example.com",
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

    // Drive postUserLoginHook from inside a Hono request so ctx.env, ctx.req,
    // and ctx.var line up with what the helper expects.
    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, server.env);
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

      // Bare Hono app — no outbox middleware, so flush the fire-and-forget
      // log write before responding or the assertions below race it.
      await flushBackgroundPromises(ctx);

      // Surface ctx.var.action_execution_id so we can sanity-check that the
      // executor pipeline actually persisted an execution (otherwise the
      // log-assertion below would silently pass for the wrong reason).
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
    expect(body.action_execution_id).toBeTypeOf("string");
    const executionId = body.action_execution_id!;

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
      execution_id: executionId,
    });

    // And the execution itself is fetchable by that id.
    const execution = await server.env.data.actionExecutions.get(
      "tenantId",
      executionId,
    );
    expect(execution).not.toBeNull();
    expect(execution?.trigger_id).toBe("post-login");
  });

  it("omits details.execution_id on SUCCESS_LOGIN when no code hooks ran", async () => {
    const server = await getTestServer();

    const user: User = {
      user_id: "auth2|no-actions",
      email: "noact@example.com",
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
    await server.env.data.users.create("tenantId", user);

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, server.env);
      ctx.set("tenant_id", "tenantId");
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");

      await postUserLoginHook(ctx, server.env.data, "tenantId", user);
      // Bare Hono app — no outbox middleware, so flush the fire-and-forget
      // log write before responding or the assertions below race it.
      await flushBackgroundPromises(ctx);
      return ctx.json({ ok: true });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": "tenantId" } },
      server.env,
    );
    expect(res.status).toBe(200);

    const { logs } = await server.env.data.logs.list("tenantId", {
      page: 0,
      per_page: 100,
      include_totals: true,
    });
    const successLogs = logs.filter(
      (log) => log.type === LogTypes.SUCCESS_LOGIN,
    );
    expect(successLogs).toHaveLength(1);
    // details may be present (e.g. auto-built request snapshot), but must NOT
    // contain execution_id.
    const details = successLogs[0]?.details as
      | Record<string, unknown>
      | undefined;
    expect(details?.execution_id).toBeUndefined();
  });
});
