import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import {
  ActionExecutionInsert,
  AuditEvent,
  AuthorizationResponseType,
  CodeExecutor,
  DataAdapters,
  User,
} from "@authhero/adapter-interfaces";
import {
  persistActionExecution,
  selectPersistedLogOutcomes,
  type CodeHookData,
  type HandleCodeHookOutcome,
} from "../../src/hooks/codehooks";
import { postUserLoginHook } from "../../src/hooks";
import { CodeHookDestination } from "../../src/helpers/outbox-destinations/code-hooks";
import { flushBackgroundPromises } from "../../src/helpers/wait-until";
import { Bindings, Variables } from "../../src/types";
import type { ActionExecutionLogCapture } from "../../src/types/AuthHeroConfig";
import { getTestServer } from "../helpers/test-server";

function outcome(
  action_name: string,
  message: string,
  failure: "none" | "error" | "denied" = "none",
): HandleCodeHookOutcome {
  return {
    result: {
      action_name,
      error:
        failure === "error"
          ? { id: "execution_threw", msg: "boom" }
          : failure === "denied"
            ? { id: "access_denied", msg: "nope" }
            : null,
      started_at: "2026-01-01T00:00:00.000Z",
      ended_at: "2026-01-01T00:00:01.000Z",
    },
    logs: [{ level: "log", message }],
    denied: failure === "denied",
  };
}

function captureAdapter() {
  const created: ActionExecutionInsert[] = [];
  const data: Pick<DataAdapters, "actionExecutions"> = {
    actionExecutions: {
      create: async (tenant_id, execution) => {
        created.push(execution);
        return { ...execution, tenant_id, created_at: "", updated_at: "" };
      },
      get: async () => null,
    },
  };
  return { data, created };
}

describe("selectPersistedLogOutcomes", () => {
  const ok = outcome("ok-action", "fine");
  const failed = outcome("failed-action", "broke", "error");
  const denied = outcome("denied-action", "denied", "denied");

  it("keeps every outcome under full (and when unset)", () => {
    expect(selectPersistedLogOutcomes([ok, failed], "full")).toEqual([
      ok,
      failed,
    ]);
    expect(selectPersistedLogOutcomes([ok, failed])).toEqual([ok, failed]);
  });

  it("keeps only failed or denied outcomes under errors", () => {
    expect(selectPersistedLogOutcomes([ok, failed, denied], "errors")).toEqual([
      failed,
      denied,
    ]);
  });

  it("keeps nothing under off", () => {
    expect(selectPersistedLogOutcomes([ok, failed], "off")).toEqual([]);
  });
});

describe("persistActionExecution logCapture", () => {
  it("persists every action's logs under full", async () => {
    const { data, created } = captureAdapter();
    await persistActionExecution(
      data,
      "t",
      "post-user-login",
      [outcome("a", "one"), outcome("b", "two")],
      { logCapture: "full" },
    );

    expect(created[0]?.logs?.map((l) => l.action_name)).toEqual(["a", "b"]);
  });

  it("persists only the failed action's logs under errors", async () => {
    const { data, created } = captureAdapter();
    await persistActionExecution(
      data,
      "t",
      "post-user-login",
      [outcome("ok", "fine"), outcome("bad", "broke", "error")],
      { logCapture: "errors" },
    );

    expect(created[0]?.status).toBe("partial");
    expect(created[0]?.results).toHaveLength(2);
    expect(created[0]?.logs).toEqual([
      { action_name: "bad", lines: [{ level: "log", message: "broke" }] },
    ]);
  });

  it("omits logs under errors when nothing failed", async () => {
    const { data, created } = captureAdapter();
    await persistActionExecution(
      data,
      "t",
      "post-user-login",
      [outcome("ok", "fine")],
      { logCapture: "errors" },
    );

    expect(created[0]?.status).toBe("final");
    expect(created[0]?.logs).toBeUndefined();
  });

  it("omits logs under off but still writes the record", async () => {
    const { data, created } = captureAdapter();
    const id = await persistActionExecution(
      data,
      "t",
      "post-user-login",
      [outcome("ok", "fine"), outcome("bad", "broke", "denied")],
      { logCapture: "off" },
    );

    expect(id).toBeTypeOf("string");
    expect(created[0]?.status).toBe("canceled");
    expect(created[0]?.results).toHaveLength(2);
    expect(created[0]?.logs).toBeUndefined();
  });
});

describe("actionExecutionLogs through a post-login request", () => {
  async function runPostLogin(mode: ActionExecutionLogCapture | undefined) {
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
    server.env.actionExecutionLogs = mode;

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
          response_type: AuthorizationResponseType.CODE,
          redirect_uri: "http://localhost/cb",
          scope: "openid",
          audience: "https://example.com",
        },
        expires_at: new Date(Date.now() + 600_000).toISOString(),
      },
    );

    const client = await server.env.data.clients.get("tenantId", "clientId");
    const tenant = await server.env.data.tenants.get("tenantId");
    if (!client || !tenant) throw new Error("test fixtures missing");

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
          client: { ...client, tenant, connections: [] },
          authParams: loginSession.authParams,
        },
      );
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
    const body: { action_execution_id: string | null } = await res.json();
    expect(body.action_execution_id).toBeTypeOf("string");

    const execution = await server.env.data.actionExecutions.get(
      "tenantId",
      body.action_execution_id ?? "",
    );
    expect(execution).not.toBeNull();
    expect(execution?.status).toBe("final");
    return execution;
  }

  it("persists logs by default", async () => {
    const execution = await runPostLogin(undefined);
    expect(execution?.logs).toEqual([
      {
        action_name: expect.any(String),
        lines: [{ level: "log", message: "hello from action" }],
      },
    ]);
  });

  it("omits logs of a successful action under errors", async () => {
    const execution = await runPostLogin("errors");
    expect(execution?.logs ?? []).toEqual([]);
  });

  it("omits logs under off", async () => {
    const execution = await runPostLogin("off");
    expect(execution?.logs ?? []).toEqual([]);
  });
});

describe("CodeHookDestination honors logCapture", () => {
  function makeDestination(logCapture?: ActionExecutionLogCapture) {
    const created: ActionExecutionInsert[] = [];
    const hooks = [
      {
        hook_id: "h1",
        code_id: "code-1",
        enabled: true,
        trigger_id: "post-user-registration",
        synchronous: false,
        priority: 0,
        created_at: "",
        updated_at: "",
      },
    ];
    const data: CodeHookData = {
      hooks: {
        list: vi.fn().mockResolvedValue({ hooks }),
        create: vi.fn(),
        get: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      actions: {
        get: vi.fn().mockResolvedValue(null),
        list: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      hookCode: {
        get: vi
          .fn()
          .mockResolvedValue({ code: "module.exports = 1;", secrets: {} }),
        create: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      },
      actionExecutions: {
        create: async (tenant_id, execution) => {
          created.push(execution);
          return { ...execution, tenant_id, created_at: "", updated_at: "" };
        },
        get: async () => null,
      },
    };
    const executor: CodeExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        durationMs: 1,
        apiCalls: [],
        logs: [{ level: "log", message: "registered a@b.test" }],
      }),
    };
    return {
      dest: new CodeHookDestination(data, executor, { logCapture }),
      created,
    };
  }

  const event: AuditEvent = {
    id: "evt-1",
    tenant_id: "tenant-1",
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: { type: "user", id: "user-1", after: { user_id: "user-1" } },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
  };

  it("persists logs when unset", async () => {
    const { dest, created } = makeDestination();
    await dest.deliver([dest.transform(event)]);
    expect(created[0]?.logs).toHaveLength(1);
  });

  it("omits logs under off", async () => {
    const { dest, created } = makeDestination("off");
    await dest.deliver([dest.transform(event)]);
    expect(created).toHaveLength(1);
    expect(created[0]?.logs).toBeUndefined();
  });
});
