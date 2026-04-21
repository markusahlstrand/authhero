import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseJWT } from "oslo/jwt";
import type {
  DataAdapters,
  HooksAdapter,
  KeysAdapter,
  LogsDataAdapter,
  OutboxAdapter,
  OutboxEvent,
  SigningKey,
  Tenant,
  TenantsDataAdapter,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { runOutboxRelay } from "../../src/helpers/run-outbox-relay";
import { createServiceTokenCore } from "../../src/helpers/service-token";
import { getCertificate } from "./token";

const TENANT_ID = "tenant-1";
const ISSUER = "https://auth.example.test/";
const AUDIENCE = "https://api.example.test";

function makeHookEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: "hook-evt-1",
    tenant_id: TENANT_ID,
    event_type: "hook.post-user-registration",
    log_type: "sapi",
    category: "system",
    actor: { type: "system" },
    target: {
      type: "user",
      id: "user-1",
      after: { user_id: "user-1", email: "a@b.com" } as any,
    },
    request: { method: "POST", path: "/users", ip: "127.0.0.1" },
    hostname: "localhost",
    timestamp: new Date().toISOString(),
    created_at: new Date().toISOString(),
    processed_at: null,
    retry_count: 0,
    next_retry_at: null,
    error: null,
    ...overrides,
  };
}

function makeOutbox(events: OutboxEvent[]): OutboxAdapter {
  const ids = events.map((e) => e.id);
  return {
    create: vi.fn().mockResolvedValue("evt-new"),
    getByIds: vi.fn().mockResolvedValue(events),
    getUnprocessed: vi.fn().mockResolvedValue(events),
    claimEvents: vi.fn().mockResolvedValue(ids),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markRetry: vi.fn().mockResolvedValue(undefined),
    deadLetter: vi.fn().mockResolvedValue(undefined),
    listFailed: vi.fn().mockResolvedValue({
      events: [],
      start: 0,
      limit: 50,
      length: 0,
    }),
    replay: vi.fn().mockResolvedValue(true),
    cleanup: vi.fn().mockResolvedValue(0),
  };
}

async function makeSigningKey(): Promise<SigningKey> {
  return getCertificate();
}

function makeTenantsAdapter(): TenantsDataAdapter {
  const tenant: Tenant = {
    id: TENANT_ID,
    friendly_name: "Test Tenant",
    audience: AUDIENCE,
    sender_email: "noreply@example.test",
    sender_name: "Test",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as Tenant;
  return {
    get: vi.fn(async (id: string) => (id === TENANT_ID ? tenant : null)),
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  } as unknown as TenantsDataAdapter;
}

function makeKeysAdapter(signingKey: SigningKey): KeysAdapter {
  return {
    create: vi.fn(),
    list: vi.fn(async () => ({
      signingKeys: [signingKey],
    })),
    update: vi.fn(),
  } as unknown as KeysAdapter;
}

function makeHooksAdapter(
  hookList: Array<{
    hook_id: string;
    url: string;
    enabled: boolean;
    trigger_id: string;
  }>,
): HooksAdapter {
  return {
    list: vi.fn().mockResolvedValue({ hooks: hookList }),
  } as unknown as HooksAdapter;
}

describe("runOutboxRelay", () => {
  it("skips gracefully when dataAdapter.outbox is undefined", async () => {
    const dataAdapter = {
      tenants: makeTenantsAdapter(),
      keys: {} as KeysAdapter,
      hooks: {} as HooksAdapter,
      logs: {} as LogsDataAdapter,
      users: {} as UserDataAdapter,
      outbox: undefined,
    } as unknown as DataAdapters;

    await expect(
      runOutboxRelay({ dataAdapter, issuer: ISSUER }),
    ).resolves.toBeUndefined();
  });

  describe("with in-memory adapters", () => {
    const fetchMock = vi.fn();
    let signingKey: SigningKey;

    beforeEach(async () => {
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
      signingKey = await makeSigningKey();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function buildAdapters(options: {
      outbox: OutboxAdapter;
      hooks: HooksAdapter;
    }): DataAdapters {
      return {
        tenants: makeTenantsAdapter(),
        keys: makeKeysAdapter(signingKey),
        hooks: options.hooks,
        logs: {
          create: vi.fn().mockResolvedValue(undefined),
        } as unknown as LogsDataAdapter,
        users: {
          update: vi.fn().mockResolvedValue(undefined),
        } as unknown as UserDataAdapter,
        outbox: options.outbox,
      } as unknown as DataAdapters;
    }

    it("dispatches hook.* events via the consumer's webhookInvoker with the expected param shape", async () => {
      const hooks = makeHooksAdapter([
        {
          hook_id: "h-cron",
          url: "https://consumer.test/hook",
          enabled: true,
          trigger_id: "post-user-registration",
        },
      ]);
      const event = makeHookEvent({ id: "hook-evt-42" });
      const outbox = makeOutbox([event]);
      const dataAdapter = buildAdapters({ outbox, hooks });

      const invokerCalls: Array<{
        hookId: string;
        tenantId: string;
        dataTriggerId: unknown;
        hasCreateServiceToken: boolean;
      }> = [];
      let capturedToken: string | undefined;

      const webhookInvoker = vi.fn(
        async ({ hook, data, tenant_id, createServiceToken }: any) => {
          invokerCalls.push({
            hookId: hook.hook_id,
            tenantId: tenant_id,
            dataTriggerId: data.trigger_id,
            hasCreateServiceToken: typeof createServiceToken === "function",
          });
          capturedToken = await createServiceToken();
          return new Response("ok", { status: 200 });
        },
      );

      await runOutboxRelay({
        dataAdapter,
        issuer: ISSUER,
        webhookInvoker,
      });

      expect(webhookInvoker).toHaveBeenCalledTimes(1);
      expect(invokerCalls[0]).toEqual({
        hookId: "h-cron",
        tenantId: TENANT_ID,
        dataTriggerId: "post-user-registration",
        hasCreateServiceToken: true,
      });

      // No raw HTTP fallback when a custom invoker is set.
      expect(fetchMock).not.toHaveBeenCalled();

      // createServiceToken returned a real signed JWT from the core path.
      expect(capturedToken).toBeTruthy();
      const parsed = parseJWT(capturedToken!);
      expect(parsed).not.toBeNull();
      const payload = parsed!.payload as Record<string, unknown>;
      expect(payload.iss).toBe(ISSUER);
      expect(payload.sub).toBe("auth-service");
      expect(payload.tenant_id).toBe(TENANT_ID);
      expect(payload.scope).toBe("webhook");

      expect(outbox.cleanup).toHaveBeenCalled();
      expect(outbox.markProcessed).toHaveBeenCalledWith(["hook-evt-42"]);
    });

    it("mints a service token from the drain that matches one minted via the shared core for the same tenant+scope", async () => {
      const hooks = makeHooksAdapter([
        {
          hook_id: "h-cmp",
          url: "https://consumer.test/cmp",
          enabled: true,
          trigger_id: "post-user-registration",
        },
      ]);
      const event = makeHookEvent({ id: "hook-evt-cmp" });
      const outbox = makeOutbox([event]);
      const dataAdapter = buildAdapters({ outbox, hooks });

      let drainToken: string | undefined;
      const webhookInvoker = vi.fn(async ({ createServiceToken }: any) => {
        drainToken = await createServiceToken();
        return new Response("ok", { status: 200 });
      });

      await runOutboxRelay({
        dataAdapter,
        issuer: ISSUER,
        webhookInvoker,
      });

      // Directly mint through the shared core — this is what the inline
      // outboxMiddleware path uses too (via makeOutboxServiceTokenFactory).
      const inlineToken = await createServiceTokenCore({
        tenants: dataAdapter.tenants,
        keys: dataAdapter.keys,
        tenantId: TENANT_ID,
        scope: "webhook",
        issuer: ISSUER,
      });

      const drainParsed = parseJWT(drainToken!);
      const inlineParsed = parseJWT(inlineToken.access_token);
      expect(drainParsed).not.toBeNull();
      expect(inlineParsed).not.toBeNull();

      const drainPayload = drainParsed!.payload as Record<string, unknown>;
      const inlinePayload = inlineParsed!.payload as Record<string, unknown>;

      // Same authorized party (sub + azp), issuer, tenant binding, scope, audience.
      expect(drainPayload.sub).toBe(inlinePayload.sub);
      expect(drainPayload.sub).toBe("auth-service");
      expect(drainPayload.azp).toBe(inlinePayload.azp);
      expect(drainPayload.azp).toBe("auth-service");
      expect(drainPayload.iss).toBe(inlinePayload.iss);
      expect(drainPayload.tenant_id).toBe(inlinePayload.tenant_id);
      expect(drainPayload.scope).toBe(inlinePayload.scope);
      expect(drainPayload.aud).toBe(inlinePayload.aud);

      // Same signing key and algorithm.
      const drainHeader = drainParsed!.header as Record<string, unknown>;
      const inlineHeader = inlineParsed!.header as Record<string, unknown>;
      expect(drainHeader.kid).toBe(inlineHeader.kid);
      expect(drainHeader.alg).toBe(inlineHeader.alg);
    });

    it("uses the default HTTP invoker and mints a Bearer token when no webhookInvoker is configured", async () => {
      fetchMock.mockResolvedValue(new Response("ok", { status: 200 }));

      const hooks = makeHooksAdapter([
        {
          hook_id: "h-default",
          url: "https://consumer.test/default",
          enabled: true,
          trigger_id: "post-user-registration",
        },
      ]);
      const event = makeHookEvent({ id: "hook-evt-99" });
      const outbox = makeOutbox([event]);
      const dataAdapter = buildAdapters({ outbox, hooks });

      await runOutboxRelay({ dataAdapter, issuer: ISSUER });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("https://consumer.test/default");
      expect(options.headers["Idempotency-Key"]).toBe("hook-evt-99");
      expect(options.headers.Authorization).toMatch(/^Bearer /);

      const bearer = (options.headers.Authorization as string).slice(
        "Bearer ".length,
      );
      const parsed = parseJWT(bearer);
      expect(parsed).not.toBeNull();
      const payload = parsed!.payload as Record<string, unknown>;
      expect(payload.iss).toBe(ISSUER);
      expect(payload.tenant_id).toBe(TENANT_ID);
      expect(payload.scope).toBe("webhook");
    });
  });
});
