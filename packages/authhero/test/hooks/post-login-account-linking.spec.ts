import { describe, it, expect } from "vitest";
import { Context } from "hono";
import {
  Strategy,
  TRIGGER_API_SHAPES,
  User,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../src/types";
import { getTestServer } from "../helpers/test-server";
import { addDataHooks } from "../../src/hooks";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import {
  resolveLinkCandidates,
  toLinkCandidates,
} from "../../src/helpers/link-candidates";
import { createPostLoginUserApi } from "../../src/hooks/helpers/post-login-account-linking";
import { executeCodeHook } from "../../src/hooks/codehooks";
import { LocalCodeExecutor } from "../../src/hooks/code-executor/local";

const tenantId = "tenantId";

function createMockCtx(
  env: Bindings,
): Context<{ Bindings: Bindings; Variables: Variables }> {
  const vars: Record<string, unknown> = {
    tenant_id: tenantId,
    ip: "127.0.0.1",
  };
  // Hand-rolled partial context — narrow through `unknown` since it only
  // implements the members these tests exercise.
  return {
    req: {
      method: "POST",
      url: "http://test",
      path: "/test",
      header: (name?: string) => (name === "tenant-id" ? tenantId : undefined),
      raw: { headers: new Headers() },
    },
    env,
    var: vars,
    get: (key: string) => vars[key],
    set: (key: string, value: unknown) => {
      vars[key] = value;
    },
  } as unknown as Context<{ Bindings: Bindings; Variables: Variables }>;
}

async function seedUser(
  env: Bindings,
  overrides: Partial<User> & { user_id: string },
) {
  return env.data.users.create(tenantId, {
    email: "shared@example.com",
    email_verified: true,
    provider: USERNAME_PASSWORD_PROVIDER,
    connection: Strategy.USERNAME_PASSWORD,
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("resolveLinkCandidates", () => {
  it("picks the oldest unlinked primary and excludes the current user", async () => {
    const { env } = await getTestServer();

    const current = await seedUser(env, {
      user_id: "google-oauth2|current",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
    });
    // Distinct providers so both can be primaries sharing the same email
    // (the adapter enforces uniqueness on provider+email).
    await seedUser(env, {
      user_id: "facebook|newer-primary",
      provider: "facebook",
      connection: "facebook",
      is_social: true,
      created_at: "2024-01-01T00:00:00.000Z",
    });
    await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|older-primary`,
      created_at: "2020-01-01T00:00:00.000Z",
    });

    const candidates = await resolveLinkCandidates({
      userAdapter: env.data.users,
      tenantId,
      user: current,
    });

    expect(candidates.map((c) => c.user_id)).not.toContain(
      "google-oauth2|current",
    );
    // Oldest first.
    expect(candidates[0]?.user_id).toBe(
      `${USERNAME_PASSWORD_PROVIDER}|older-primary`,
    );
    const serialized = toLinkCandidates(candidates);
    expect(serialized[0]).toMatchObject({
      user_id: `${USERNAME_PASSWORD_PROVIDER}|older-primary`,
      is_primary: true,
      is_oldest: true,
    });
    expect(serialized.filter((c) => c.is_oldest)).toHaveLength(1);
  });

  it("resolves linked_to chains to their roots when there is no direct primary", async () => {
    const { env } = await getTestServer();

    const primary = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|root`,
      created_at: "2020-01-01T00:00:00.000Z",
    });
    // Only a secondary shares the email directly; its root is `primary`.
    await seedUser(env, {
      user_id: "facebook|secondary",
      provider: "facebook",
      connection: "facebook",
      is_social: true,
      linked_to: primary.user_id,
      created_at: "2025-02-01T00:00:00.000Z",
    });

    const current = await seedUser(env, {
      user_id: "google-oauth2|current2",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
    });

    const candidates = await resolveLinkCandidates({
      userAdapter: env.data.users,
      tenantId,
      user: current,
    });

    expect(candidates.map((c) => c.user_id)).toEqual([primary.user_id]);
  });

  it("returns an empty list when nothing else shares the email", async () => {
    const { env } = await getTestServer();
    const current = await seedUser(env, {
      user_id: "google-oauth2|lonely",
      email: "unique@example.com",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });
    const candidates = await resolveLinkCandidates({
      userAdapter: env.data.users,
      tenantId,
      user: current,
    });
    expect(candidates).toEqual([]);
  });
});

describe("createPostLoginUserApi.setLinkedTo", () => {
  it("rejects a user_id that is not among the candidates and mutates nothing", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const current = await seedUser(env, {
      user_id: "google-oauth2|reject",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });
    // A real user that is NOT a candidate — the guard must still refuse it.
    const bystander = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|bystander`,
      email: "someone-else@example.com",
    });

    const { api, getLinkedPrimaryId } = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates: [],
    });

    await api.user.setLinkedTo(bystander.user_id);

    expect(getLinkedPrimaryId()).toBeNull();
    const after = await env.data.users.get(tenantId, current.user_id);
    expect(after?.linked_to).toBeFalsy();
  });

  it("links the logging-in user to an older candidate (current user is newer)", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const older = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|older`,
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const current = await seedUser(env, {
      user_id: "google-oauth2|newer",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
    });

    const { api, getLinkedPrimaryId } = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates: [older],
    });

    await api.user.setLinkedTo(older.user_id);

    expect(getLinkedPrimaryId()).toBe(older.user_id);
    const currentAfter = await env.data.users.get(tenantId, current.user_id);
    const olderAfter = await env.data.users.get(tenantId, older.user_id);
    expect(currentAfter?.linked_to).toBe(older.user_id);
    expect(olderAfter?.linked_to).toBeFalsy();
  });

  it("demotes the candidate when the logging-in user pre-dates it (direction)", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const current = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|older-current`,
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const newerCandidate = await seedUser(env, {
      user_id: "google-oauth2|newer-candidate",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
    });

    const { api, getLinkedPrimaryId } = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates: [newerCandidate],
    });

    await api.user.setLinkedTo(newerCandidate.user_id);

    expect(getLinkedPrimaryId()).toBe(current.user_id);
    const currentAfter = await env.data.users.get(tenantId, current.user_id);
    const candidateAfter = await env.data.users.get(
      tenantId,
      newerCandidate.user_id,
    );
    expect(currentAfter?.linked_to).toBeFalsy();
    expect(candidateAfter?.linked_to).toBe(current.user_id);
  });

  it("is idempotent — running twice leaves the same end state", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const older = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|idem-older`,
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const current = await seedUser(env, {
      user_id: "google-oauth2|idem-current",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
    });

    const { api } = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates: [older],
    });

    await api.user.setLinkedTo(older.user_id);
    await api.user.setLinkedTo(older.user_id);

    const currentAfter = await env.data.users.get(tenantId, current.user_id);
    expect(currentAfter?.linked_to).toBe(older.user_id);
    // Exactly one secondary points at the primary.
    const { users: secondaries } = await env.data.users.list(tenantId, {
      page: 0,
      per_page: 10,
      include_totals: false,
      q: `linked_to:${older.user_id}`,
    });
    expect(secondaries.map((u) => u.user_id)).toEqual([current.user_id]);
  });

  it("refuses to link an unverified-email user regardless of candidate", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const older = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|verified-older`,
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const current = await seedUser(env, {
      user_id: "google-oauth2|unverified",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      email_verified: false,
      created_at: "2025-06-01T00:00:00.000Z",
    });

    const { api, getLinkedPrimaryId } = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates: [older],
    });

    await api.user.setLinkedTo(older.user_id);

    expect(getLinkedPrimaryId()).toBeNull();
    const after = await env.data.users.get(tenantId, current.user_id);
    expect(after?.linked_to).toBeFalsy();
  });
});

describe("post-user-login code hook linking (end-to-end via executeCodeHook)", () => {
  it("an action reads event.link_candidates and links through the async replay path", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const older = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|e2e-older`,
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const current = await seedUser(env, {
      user_id: "google-oauth2|e2e-current",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      created_at: "2025-06-01T00:00:00.000Z",
    });

    const candidates = await resolveLinkCandidates({
      userAdapter: env.data.users,
      tenantId,
      user: current,
    });
    expect(candidates.map((c) => c.user_id)).toContain(older.user_id);

    const linking = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates,
    });

    const hookCode = await env.data.hookCode.create(tenantId, {
      code: `
exports.onExecutePostLogin = async (event, api) => {
  const target = event.link_candidates.find((c) => c.is_oldest);
  if (target) api.user.setLinkedTo(target.user_id);
};
`,
    });

    const outcome = await executeCodeHook({
      codeExecutor: new LocalCodeExecutor(),
      data: env.data,
      tenantId,
      hook: { code_id: hookCode.id },
      event: {
        user: current,
        link_candidates: toLinkCandidates(candidates),
      },
      triggerId: "post-user-login",
      api: linking.api,
    });

    expect(outcome.result.error).toBeNull();
    // The link must have completed *before* executeCodeHook resolved — the
    // whole point of awaiting replay.
    expect(linking.getLinkedPrimaryId()).toBe(older.user_id);
    const currentAfter = await env.data.users.get(tenantId, current.user_id);
    expect(currentAfter?.linked_to).toBe(older.user_id);
  });

  it("an action linking to a non-candidate user_id is rejected and mutates nothing", async () => {
    const { env } = await getTestServer();
    const data = addDataHooks(createMockCtx(env), env.data);

    const current = await seedUser(env, {
      user_id: "google-oauth2|e2e-reject",
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });
    const bystander = await seedUser(env, {
      user_id: `${USERNAME_PASSWORD_PROVIDER}|e2e-bystander`,
      email: "bystander@example.com",
    });

    const linking = createPostLoginUserApi({
      ctx: createMockCtx(env),
      data,
      tenantId,
      user: current,
      candidates: [],
    });

    const hookCode = await env.data.hookCode.create(tenantId, {
      code: `
exports.onExecutePostLogin = async (event, api) => {
  api.user.setLinkedTo(${JSON.stringify(bystander.user_id)});
};
`,
    });

    await executeCodeHook({
      codeExecutor: new LocalCodeExecutor(),
      data: env.data,
      tenantId,
      hook: { code_id: hookCode.id },
      event: { user: current, link_candidates: [] },
      triggerId: "post-user-login",
      api: linking.api,
    });

    expect(linking.getLinkedPrimaryId()).toBeNull();
    const after = await env.data.users.get(tenantId, current.user_id);
    expect(after?.linked_to).toBeFalsy();
  });
});

describe("shared code-hook API shapes", () => {
  it("exposes user.setLinkedTo at post-user-login", () => {
    expect(TRIGGER_API_SHAPES["post-user-login"]?.user).toContain(
      "setLinkedTo",
    );
  });

  it("the local executor records user.setLinkedTo calls (uses the shared shape)", async () => {
    const exec = new LocalCodeExecutor();
    const result = await exec.execute({
      code: `
exports.onExecutePostLogin = async (event, api) => {
  api.user.setLinkedTo("auth2|primary");
};
`,
      triggerId: "post-user-login",
      event: {},
    });
    expect(result.success).toBe(true);
    expect(result.apiCalls).toEqual([
      { method: "user.setLinkedTo", args: ["auth2|primary"] },
    ]);
  });
});
