import { describe, expect, it, vi } from "vitest";
import { Context, Hono } from "hono";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { getTestServer } from "../helpers/test-server";
import { mintScimToken } from "../../src/helpers/scim/mint-token";
import { logMessage } from "../../src/helpers/logging";
import { Bindings, Variables } from "../../src/types";

const TENANT = "tenantId";
// Deep enough not to match the route groups' own `/:param` routes.
const PROBE = "/__probe/request-data/check";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

// What a handler sees: the request's stack must be on `ctx.var.data`, the
// deprecated `ctx.env.data` alias must point at the same object, and it must be
// a per-request composition rather than the raw startup adapter.
function probe(raw: DataAdapters) {
  return (ctx: Ctx) =>
    ctx.json({
      hasVar: ctx.var.data !== undefined,
      sameAsEnv: ctx.var.data === ctx.env.data,
      isRaw: ctx.var.data === raw,
    });
}

const composed = { hasVar: true, sameAsEnv: true, isRaw: false };

describe("ctx.var.data", () => {
  it("matches env.data and is the composed stack in auth-api", async () => {
    const { oauthApp, env } = await getTestServer();
    const raw = env.data;
    oauthApp.get(PROBE, probe(raw));

    const res = await oauthApp.request(
      PROBE,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("matches env.data and is the composed stack in universal-login", async () => {
    const { universalApp, env } = await getTestServer();
    const raw = env.data;
    universalApp.get(PROBE, probe(raw));

    const res = await universalApp.request(
      PROBE,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("matches env.data and is the composed stack in u2", async () => {
    const { u2App, env } = await getTestServer();
    const raw = env.data;
    // u2's `/:screen{.+}` catch-all owns every GET and POST path.
    u2App.put(PROBE, probe(raw));

    const res = await u2App.request(
      PROBE,
      { method: "PUT", headers: { "tenant-id": TENANT } },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("matches env.data and is the composed stack in saml", async () => {
    const { samlApp, env } = await getTestServer();
    const raw = env.data;
    samlApp.get(PROBE, probe(raw));

    const res = await samlApp.request(
      PROBE,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("matches env.data and is the composed stack in scim", async () => {
    const { scimApp, env } = await getTestServer();
    const { scimConfigurations, scimTokens } = env.data;
    if (!scimApp || !scimConfigurations || !scimTokens) {
      throw new Error("SCIM adapters not wired in test server");
    }
    const raw = env.data;

    const connection = await env.data.connections.create(TENANT, {
      name: "okta-ent",
      strategy: "oidc",
      options: {},
    });
    await scimConfigurations.create(TENANT, {
      connection_id: connection.id,
      user_id_attribute: "externalId",
      mapping: [],
    });
    const minted = await mintScimToken();
    await scimTokens.create(TENANT, {
      token_id: minted.token_id,
      connection_id: connection.id,
      token_hash: minted.token_hash,
      scopes: [],
    });

    scimApp.get(PROBE, probe(raw));
    // scimAuthMiddleware reads `connection_id` from the mount path.
    const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
    app.route("/scim/v2/connections/:connection_id", scimApp);

    const res = await app.request(
      `/scim/v2/connections/${connection.id}${PROBE}`,
      {
        headers: {
          "tenant-id": TENANT,
          authorization: `Bearer ${minted.token}`,
        },
      },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("matches env.data and is the composed stack in management-api", async () => {
    const { managementApp, env } = await getTestServer();
    const raw = env.data;
    managementApp.get(PROBE, probe(raw));

    const res = await managementApp.request(
      PROBE,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("matches env.data after the management API adds entity hooks", async () => {
    // With entityHooks set, the stack is re-wrapped once the tenant is known,
    // which is the second of the two management-api composition sites.
    const { managementApp, env } = await getTestServer({ entityHooks: {} });
    const raw = env.data;
    managementApp.get(PROBE, probe(raw));

    const res = await managementApp.request(
      PROBE,
      { headers: { "tenant-id": TENANT } },
      env,
    );
    expect(await res.json()).toEqual(composed);
    expect(env.data).toBe(raw);
  });

  it("gives concurrent requests on one shared env their own stack", async () => {
    const { oauthApp, env } = await getTestServer();
    const raw = env.data;

    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstArrived: () => void = () => {};
    const firstHasArrived = new Promise<void>((resolve) => {
      firstArrived = resolve;
    });

    const stacks = new Map<string, DataAdapters>();
    oauthApp.get(`${PROBE}/:id`, async (ctx) => {
      const id = ctx.req.param("id");
      const own = ctx.var.data;
      stacks.set(id, own);
      if (id === "first") {
        firstArrived();
        await firstGate;
      }
      return ctx.json({
        varUnchanged: ctx.var.data === own,
        envUnchanged: ctx.env.data === own,
      });
    });

    const init = { headers: { "tenant-id": TENANT } };
    // Workers pass the same env object to every request in an isolate.
    const first = oauthApp.request(`${PROBE}/first`, init, env);
    await firstHasArrived;
    // Second request runs to completion while the first is still in flight.
    const second = await oauthApp.request(`${PROBE}/second`, init, env);
    releaseFirst();

    const unchanged = { varUnchanged: true, envUnchanged: true };
    expect(await second.json()).toEqual(unchanged);
    expect(await (await first).json()).toEqual(unchanged);

    const firstStack = stacks.get("first");
    const secondStack = stacks.get("second");
    expect(firstStack).toBeDefined();
    expect(secondStack).toBeDefined();
    expect(firstStack).not.toBe(secondStack);
    expect(firstStack).not.toBe(raw);
    expect(secondStack).not.toBe(raw);
    // The runtime's env object itself is never mutated.
    expect(env.data).toBe(raw);
  });
});

type Env = { Bindings: Bindings; Variables: Variables };

// A raw adapter that an earlier middleware (e.g. multi-tenancy database
// isolation) installs as this request's base, with `tenants.get` spied so a
// read through the composed stack shows which adapter it reached.
function baseAdapter(raw: DataAdapters) {
  const get = vi.fn(raw.tenants.get);
  return { base: { ...raw, tenants: { ...raw.tenants, get } }, get };
}

function mountWithBase(subApp: Hono<Env>, base: DataAdapters) {
  const app = new Hono<Env>();
  app.use("*", async (ctx, next) => {
    ctx.set("baseData", base);
    await next();
  });
  app.route("/", subApp);
  return app;
}

function baseProbe(base: DataAdapters) {
  return async (ctx: Ctx) => {
    await ctx.var.data.tenants.get(TENANT);
    return ctx.json({
      isBase: ctx.var.data === base,
      sameAsEnv: ctx.var.data === ctx.env.data,
    });
  };
}

describe("ctx.var.baseData", () => {
  const groups: {
    name: string;
    app: "oauthApp" | "universalApp" | "u2App" | "samlApp" | "managementApp";
    method: "GET" | "PUT";
  }[] = [
    { name: "auth-api", app: "oauthApp", method: "GET" },
    { name: "universal-login", app: "universalApp", method: "GET" },
    // u2's `/:screen{.+}` catch-all owns every GET and POST path.
    { name: "u2", app: "u2App", method: "PUT" },
    { name: "saml", app: "samlApp", method: "GET" },
    { name: "management-api", app: "managementApp", method: "GET" },
  ];

  for (const group of groups) {
    it(`is the adapter ${group.name} composes on`, async () => {
      const server = await getTestServer({ entityHooks: {} });
      const subApp = server[group.app];
      const raw = server.env.data;
      const { base, get } = baseAdapter(raw);
      subApp.on(group.method, PROBE, baseProbe(base));

      const res = await mountWithBase(subApp, base).request(
        PROBE,
        { method: group.method, headers: { "tenant-id": TENANT } },
        server.env,
      );

      // Composed on top of the base, not the base itself and not the startup
      // adapter: the read reached the base's spy.
      expect(await res.json()).toEqual({ isBase: false, sameAsEnv: true });
      expect(get).toHaveBeenCalledWith(TENANT);
      expect(server.env.data).toBe(raw);
    });
  }

  it("is the adapter scim composes on", async () => {
    const server = await getTestServer();
    const { scimApp, env } = server;
    const { scimConfigurations, scimTokens } = env.data;
    if (!scimApp || !scimConfigurations || !scimTokens) {
      throw new Error("SCIM adapters not wired in test server");
    }
    const raw = env.data;
    const { base, get } = baseAdapter(raw);

    const connection = await raw.connections.create(TENANT, {
      name: "okta-ent",
      strategy: "oidc",
      options: {},
    });
    const connectionId = connection.id;
    if (!connectionId) throw new Error("connection has no id");
    await scimConfigurations.create(TENANT, {
      connection_id: connectionId,
      user_id_attribute: "externalId",
      mapping: [],
    });
    const minted = await mintScimToken();
    await scimTokens.create(TENANT, {
      token_id: minted.token_id,
      connection_id: connectionId,
      token_hash: minted.token_hash,
      scopes: [],
    });

    scimApp.get(PROBE, baseProbe(base));
    const app = new Hono<Env>();
    app.use("*", async (ctx, next) => {
      ctx.set("baseData", base);
      await next();
    });
    // scimAuthMiddleware reads `connection_id` from the mount path.
    app.route("/scim/v2/connections/:connection_id", scimApp);

    const res = await app.request(
      `/scim/v2/connections/${connectionId}${PROBE}`,
      {
        headers: {
          "tenant-id": TENANT,
          authorization: `Bearer ${minted.token}`,
        },
      },
      env,
    );

    expect(await res.json()).toEqual({ isBase: false, sameAsEnv: true });
    expect(get).toHaveBeenCalledWith(TENANT);
    expect(env.data).toBe(raw);
  });

  for (const group of groups) {
    it(`drains the ${group.name} outbox and writes logs through the base`, async () => {
      const configClaim = vi.fn();
      const configLogsCreate = vi.fn();
      const server = await getTestServer({
        outbox: true,
        wrapDataAdapter: (data) => {
          if (!data.outbox) throw new Error("outbox adapter not wired");
          return {
            ...data,
            outbox: { ...data.outbox, claimEvents: configClaim },
            logs: { ...data.logs, create: configLogsCreate },
          };
        },
      });
      const raw = server.env.data;
      if (!raw.outbox) throw new Error("outbox adapter not wired");
      const baseClaim = vi.fn(raw.outbox.claimEvents);
      const baseLogsCreate = vi.fn(raw.logs.create);
      const base: DataAdapters = {
        ...raw,
        outbox: { ...raw.outbox, claimEvents: baseClaim },
        logs: { ...raw.logs, create: baseLogsCreate },
      };

      const subApp = server[group.app];
      subApp.on(group.method, PROBE, async (ctx) => {
        await logMessage(ctx, TENANT, { type: "s", description: "probe" });
        return ctx.text("ok");
      });

      const res = await mountWithBase(subApp, base).request(
        PROBE,
        { method: group.method, headers: { "tenant-id": TENANT } },
        server.env,
      );

      expect(res.status).toBe(200);
      expect(baseClaim).toHaveBeenCalledTimes(1);
      expect(baseLogsCreate).toHaveBeenCalledWith(
        TENANT,
        expect.objectContaining({ description: "probe" }),
      );
      expect(configClaim).not.toHaveBeenCalled();
      expect(configLogsCreate).not.toHaveBeenCalled();
    });
  }
});
