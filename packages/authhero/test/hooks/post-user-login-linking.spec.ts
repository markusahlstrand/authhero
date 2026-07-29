import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { Strategy, User } from "@authhero/adapter-interfaces";
import { postUserLoginHook } from "../../src/hooks";
import { LocalCodeExecutor } from "../../src/hooks/code-executor/local";
import { flushBackgroundPromises } from "../../src/helpers/wait-until";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Bindings, Variables } from "../../src/types";
import { EnrichedClient } from "../../src/helpers/client";
import { getTestServer } from "../helpers/test-server";

const tenantId = "tenantId";

function makeEnrichedClient(): EnrichedClient {
  // Minimal shape for the hook path under test — narrow through `unknown`.
  return {
    id: "clientId",
    name: "Test",
    client_id: "clientId",
    tenant: { id: tenantId },
    callbacks: ["http://localhost/cb"],
    allowed_logout_urls: [],
    web_origins: [],
    grant_types: ["authorization_code" as const],
    connections: [],
  } as unknown as EnrichedClient;
}

async function makeLoginSession(env: Bindings) {
  return env.data.loginSessions.create(tenantId, {
    csrf_token: "csrf",
    authParams: {
      client_id: "clientId",
      response_type: "code",
      redirect_uri: "http://localhost/cb",
      scope: "openid",
      audience: "https://example.com",
    },
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  });
}

/**
 * Wrap `data.users.list` to count same-email lookups (`q: "email:…"`) — the
 * query `resolveLinkCandidates` issues. Lets us assert the opt-in gate: tenants
 * that didn't opt in pay no extra query.
 */
function countEmailListCalls(env: Bindings): () => number {
  let count = 0;
  const original = env.data.users.list.bind(env.data.users);
  env.data.users.list = async (
    tid: string,
    opts: Parameters<typeof original>[1],
  ) => {
    if (typeof opts?.q === "string" && opts.q.startsWith("email:")) count++;
    return original(tid, opts);
  };
  return () => count;
}

describe("post-user-login programmable account linking (integration)", () => {
  it("an opted-in code hook links the user via event.link_candidates; the returned user is the primary", async () => {
    const server = await getTestServer({
      codeExecutor: new LocalCodeExecutor(),
    });
    const env = server.env;

    // Older canonical primary (password) sharing the email.
    const olderId = `${USERNAME_PASSWORD_PROVIDER}|int-older`;
    await env.data.users.create(tenantId, {
      user_id: olderId,
      email: "int-shared@example.com",
      email_verified: true,
      provider: USERNAME_PASSWORD_PROVIDER,
      connection: Strategy.USERNAME_PASSWORD,
      created_at: "2020-01-01T00:00:00.000Z",
      updated_at: "2020-01-01T00:00:00.000Z",
    });

    // The logging-in (newer, social) user with the same verified email.
    const current: User = {
      user_id: "google-oauth2|int-current",
      email: "int-shared@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
      updated_at: "2025-06-01T00:00:00.000Z",
      last_ip: "",
      last_login: "",
      login_count: 0,
    };
    await env.data.users.create(tenantId, current);

    const action = await env.data.actions.create(tenantId, {
      name: "custom-account-linking",
      code: `
exports.onExecutePostLogin = async (event, api) => {
  const target = (event.link_candidates || []).find((c) => c.is_oldest);
  if (target) api.user.setLinkedTo(target.user_id);
};
`,
    });
    await env.data.hooks.create(tenantId, {
      trigger_id: "post-user-login",
      enabled: true,
      code_id: action.id,
      synchronous: true,
      metadata: { resolve_link_candidates: true },
    });

    const loginSession = await makeLoginSession(env);

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, env);
      ctx.set("tenant_id", tenantId);
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");
      ctx.set("client_id", "clientId");

      const result = await postUserLoginHook(
        ctx,
        env.data,
        tenantId,
        current,
        loginSession,
        {
          client: makeEnrichedClient(),
          authParams: loginSession.authParams,
        },
      );
      await flushBackgroundPromises(ctx);
      const user = result as User;
      return ctx.json({
        user_id: user.user_id,
        linked_to: user.linked_to ?? null,
      });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": tenantId } },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      user_id: string;
      linked_to: string | null;
    };

    // Downstream sees the primary (older account won).
    expect(body.user_id).toBe(olderId);
    expect(body.linked_to).toBeNull();

    // And the link persisted: the logging-in user is now a secondary.
    const currentAfter = await env.data.users.get(tenantId, current.user_id);
    expect(currentAfter?.linked_to).toBe(olderId);
  });

  it("a post-login code hook that only sets a claim triggers no candidate query (not opted in)", async () => {
    const server = await getTestServer({
      codeExecutor: new LocalCodeExecutor(),
    });
    const env = server.env;

    const current: User = {
      user_id: "google-oauth2|int-noopt",
      email: "int-noopt@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
      updated_at: "2025-06-01T00:00:00.000Z",
      last_ip: "",
      last_login: "",
      login_count: 0,
    };
    await env.data.users.create(tenantId, current);

    const action = await env.data.actions.create(tenantId, {
      name: "claims-only",
      code: `
exports.onExecutePostLogin = async (event, api) => {
  api.idToken.setCustomClaim("hello", "world");
};
`,
    });
    // No resolve_link_candidates metadata → opted out.
    await env.data.hooks.create(tenantId, {
      trigger_id: "post-user-login",
      enabled: true,
      code_id: action.id,
      synchronous: true,
    });

    const loginSession = await makeLoginSession(env);
    const getEmailListCalls = countEmailListCalls(env);

    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.post("/run", async (ctx) => {
      Object.assign(ctx.env, env);
      ctx.set("tenant_id", tenantId);
      ctx.set("ip", "1.2.3.4");
      ctx.set("useragent", "test");
      ctx.set("client_id", "clientId");

      await postUserLoginHook(ctx, env.data, tenantId, current, loginSession, {
        client: makeEnrichedClient(),
        authParams: loginSession.authParams,
      });
      await flushBackgroundPromises(ctx);
      return ctx.json({ ok: true });
    });

    const res = await app.request(
      "/run",
      { method: "POST", headers: { "tenant-id": tenantId } },
      env,
    );
    expect(res.status).toBe(200);
    expect(getEmailListCalls()).toBe(0);
  });
});
