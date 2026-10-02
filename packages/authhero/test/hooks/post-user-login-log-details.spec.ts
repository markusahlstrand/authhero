import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import {
  AuditEvent,
  CodeExecutor,
  LogTypes,
  User,
} from "@authhero/adapter-interfaces";
import { postUserLoginHook } from "../../src/hooks";
import { flushBackgroundPromises } from "../../src/helpers/wait-until";
import { drainOutbox, EventDestination } from "../../src/helpers/outbox-relay";
import { LogsDestination } from "../../src/helpers/outbox-destinations/logs";
import { Bindings, Variables } from "../../src/types";
import { getTestServer } from "../helpers/test-server";

const AUTHORIZATION_URL =
  "https://auth.example.com/authorize?client_id=clientId" +
  "&redirect_uri=http%3A%2F%2Flocalhost%2Fcb&login_hint=someone%40example.com" +
  "&state=secret-state&nonce=secret-nonce" +
  "&utm_source=newsletter&utm_medium=email&utm_campaign=oct&gclid=abc123";

const succeedingExecutor: CodeExecutor = {
  async execute() {
    return { success: true, durationMs: 1, apiCalls: [], logs: [] };
  },
};

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

async function successLoginDetails(options: { outbox: boolean }) {
  const server = await getTestServer({
    codeExecutor: succeedingExecutor,
    outbox: options.outbox,
  });

  // A post-login action, so the login has an execution id to link to.
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
    user_id: "auth2|attribution-user",
    email: "user@example.com",
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

  const loginSession = await server.env.data.loginSessions.create("tenantId", {
    csrf_token: "csrf",
    authorization_url: AUTHORIZATION_URL,
    authParams: {
      client_id: "clientId",
      response_type: "code",
      redirect_uri: "http://localhost/cb",
      scope: "openid",
    },
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });

  // The login completes on a later request (here: /callback?code&state),
  // which is why the authorize URL has to come from the login session.
  const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
  app.get("/callback", async (ctx) => {
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
        client: makeEnrichedClient() as never,
        authParams: loginSession.authParams,
      },
    );

    // Bare app: no outbox middleware, so settle the writes here.
    await Promise.all(ctx.var.outboxEventPromises ?? []);
    await flushBackgroundPromises(ctx);
    return ctx.json({
      action_execution_id: ctx.var.action_execution_id ?? null,
    });
  });

  const res = await app.request(
    "/callback?code=abc&state=xyz",
    { method: "GET" },
    server.env,
  );
  expect(res.status).toBe(200);
  const { action_execution_id } = (await res.json()) as {
    action_execution_id: string | null;
  };
  expect(action_execution_id).toBeTypeOf("string");

  // Captures what the relay hands to destinations such as log streams.
  const relayed: AuditEvent[] = [];
  const capture: EventDestination = {
    name: "capture",
    transform: (event) => event,
    async deliver(events) {
      relayed.push(...(events as AuditEvent[]));
    },
  };
  if (options.outbox) {
    await drainOutbox(server.env.data.outbox!, [
      new LogsDestination(server.env.data.logs),
      capture,
    ]);
  }

  const { logs } = await server.env.data.logs.list("tenantId", {
    page: 0,
    per_page: 100,
    include_totals: true,
  });
  const successLogs = logs.filter((log) => log.type === LogTypes.SUCCESS_LOGIN);
  expect(successLogs).toHaveLength(1);
  return {
    details: successLogs[0]!.details,
    action_execution_id,
    relayedSuccess: relayed.find((e) => e.log_type === LogTypes.SUCCESS_LOGIN),
  };
}

describe.each([
  { path: "without the outbox", outbox: false },
  { path: "through the outbox relay", outbox: true },
])("Successful Login log $path", ({ outbox }) => {
  it("records redirect_uri and execution_id, but not the authorize URL", async () => {
    const { details, action_execution_id } = await successLoginDetails({
      outbox,
    });

    expect(details).toMatchObject({
      execution_id: action_execution_id,
      request: {
        path: "/callback",
        redirect_uri: "http://localhost/cb",
      },
    });
    expect(details?.request).not.toHaveProperty("authorization_url");
    expect(JSON.stringify(details)).not.toContain("someone@example.com");
  });
});

describe("Successful Login audit event", () => {
  it("carries the original authorize URL to outbox destinations", async () => {
    const { relayedSuccess } = await successLoginDetails({ outbox: true });

    expect(relayedSuccess?.request.authorization_url).toBe(AUTHORIZATION_URL);
  });
});
