/**
 * Cloudflare Worker entry — the REAL AuthHero auth core as a Substrat vertical
 * (design stage 1b). One serving script for all tenants; per tenant:
 *
 *  - a kernel SCOPE DO holding the platform-projected entitlements (#310) and
 *    the probe module (the §5.4 read-port diagnostic), and
 *  - a PLATFORM-MINTED D1 (tenantStores/#301 PR-2), attached to this script by
 *    the platform and opened at request time via
 *    `env[tenantStoreBindingName("AUTH_DB", tenantId)]` — never a bundle-chosen
 *    database id, never an account credential in the vertical.
 *
 * /internal/provision is the K-31 ready-gate: project the kernel scope, migrate
 * the tenant D1 to the bundled frontier, seed a WORKING tenant (admin, password
 * connection, client, signing key). The catch-all then serves the real authhero
 * app over that store — tenant identity comes from the router assertion, and
 * inside the app authhero's own tenantMiddleware single-tenant auto-detect does
 * the rest (each store holds exactly one tenant).
 *
 * Custom domains: no CONTROL_PLANE binding exists here by design — hostname
 * binding is the platform's (`substrat hostnames`); authhero-side custom-domain
 * writes stay fail-closed exactly as the cloudflare-wfp-tenant template's
 * read-only fallback behaves when CONTROL_PLANE_URL is unset.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { init, seed, hashPassword, type AuthHeroConfig } from "authhero";
import {
  defineScopeDO,
  CloudflareScopeHost,
  d1TenantRelationalStore,
} from "@substrat-run/adapter-cloudflare";
import {
  principalId as principalIdOf,
  tenantId as tenantIdOf,
  scopeId as scopeIdOf,
  tenantStoreBindingName,
  readScopeTableInput,
  queryScopeInput,
  entitlementGrant,
  z,
  type TenantId,
} from "@substrat-run/contracts";
import {
  assertAllowed,
  assertPlatformCall,
  PlatformCallError,
  readRoutedNode,
  RouterAssertionError,
  ulid,
  type ModuleRegistration,
  type OperationHandler,
} from "@substrat-run/kernel";
import { applyMigrations } from "./store.js";
import { widgetHandler, adminHandler, adminIndexFor } from "./ui.js";

// ── The kernel module (definition shared with src/permissions.ts) ────────────

import {
  FEATURE_ENTITLEMENT,
  PERM_FEATURE_CHECK,
  authcoreManifest as manifest,
  ROLES,
  OWNER_ROLE,
} from "./module-def.js";

const probeInput = z.object({ feature: z.string().min(1) });
const probeFeature: OperationHandler = async (ctx, input) => {
  assertAllowed(await ctx.check(PERM_FEATURE_CHECK));
  const { feature } = probeInput.parse(input);
  const key = FEATURE_ENTITLEMENT[feature];
  if (!key) throw new Error(`unknown feature: ${feature}`);
  const view = await ctx.entitlement(key);
  return {
    feature,
    entitlementKey: key,
    enabled: view !== null,
    plan: view?.plan ?? null,
  };
};

const authcoreModule: ModuleRegistration = {
  manifest,
  migrations: [],
  operations: { "authcore/probe-feature": probeFeature },
};

const MODULES = [authcoreModule];
export const ScopeDO = defineScopeDO(MODULES, {});

// ── Worker plumbing ──────────────────────────────────────────────────────────

interface Env {
  SCOPE: DurableObjectNamespace;
  PLATFORM_SECRET?: string;
  ROUTER_SECRET?: string;
  /** Local wrangler dev only: x-tenant seam + the static fallback store. */
  ALLOW_DEV_HEADER?: string;
  AUTH_DB_DEV?: D1Database;
  /** Per-tenant D1s attached by the platform under tenantStoreBindingName(...). */
  [binding: string]: unknown;
}

const STORE_BINDING = "AUTH_DB";

function hostFor(env: Env): CloudflareScopeHost {
  const host = new CloudflareScopeHost({ scope: env.SCOPE });
  for (const m of MODULES) host.registerModule(m);
  return host;
}

function isD1(value: unknown): value is D1Database {
  return (
    typeof value === "object" &&
    value !== null &&
    "prepare" in value &&
    "batch" in value
  );
}

/** The tenant's platform-attached D1 (or the dev fallback under wrangler dev). */
function tenantDb(env: Env, tenant: TenantId): D1Database {
  const bound: unknown = env[tenantStoreBindingName(STORE_BINDING, tenant)];
  if (isD1(bound)) return bound;
  if (env.ALLOW_DEV_HEADER === "true" && env.AUTH_DB_DEV)
    return env.AUTH_DB_DEV;
  throw new HTTPException(503, {
    message: `no tenant store attached for ${tenant} (binding ${tenantStoreBindingName(STORE_BINDING, tenant)}) — provision first`,
  });
}

function tenantFor(req: Request, env: Env): TenantId {
  let routed;
  try {
    routed = readRoutedNode(req.headers, { expectedSecret: env.ROUTER_SECRET });
  } catch (e) {
    if (e instanceof RouterAssertionError)
      throw new HTTPException(400, { message: e.message });
    throw e;
  }
  if (routed) return routed.tenantId;
  if (env.ALLOW_DEV_HEADER === "true") {
    const dev = req.headers.get("x-tenant");
    if (dev) return tenantIdOf.parse(dev);
  }
  throw new HTTPException(503, {
    message:
      "no tenant was asserted for this request (missing router assertion)",
  });
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({ ok: true, vertical: "authhero-auth-core", standIn: false }),
);

function gatePlatform(c: { env: Env; req: { raw: Request } }): void {
  try {
    assertPlatformCall(c.req.raw.headers, {
      expectedSecret: c.env.PLATFORM_SECRET,
    });
  } catch (e) {
    if (e instanceof PlatformCallError)
      throw new HTTPException(403, { message: e.message });
    throw e;
  }
}

// ── Instance config: durable per-tenant entries + the bootstrap they drive ───
// configureInstance delivers settings as key-by-key upserts (never a full
// replace); the vertical owns durable storage. Ours lives in the tenant D1
// beside the data it configures. `__owner` is the owner-of-record reconcile
// re-sources (the platform deliberately never persists one).

const CONFIG_TABLE = "_authhero_instance_config";

async function putConfigEntries(
  store: ReturnType<typeof d1TenantRelationalStore>,
  entries: Array<{ key: string; value: string }>,
): Promise<void> {
  await store.exec(
    `CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );
  for (const e of entries) {
    await store.exec(
      `INSERT INTO ${CONFIG_TABLE} (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [e.key, e.value],
    );
  }
}

async function getStoredConfig(
  store: ReturnType<typeof d1TenantRelationalStore>,
): Promise<Record<string, string>> {
  await store.exec(
    `CREATE TABLE IF NOT EXISTS ${CONFIG_TABLE} (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  );
  const rows = await store.query<{ key: string; value: string }>(
    `SELECT key, value FROM ${CONFIG_TABLE}`,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Ensure the instance's OWN origin is on the seeded client's URL lists —
 *  the admin UI logs in/out against the tenant's own host, which seed's
 *  defaults (manage.authhero.net + localhost) never include. Idempotent. */
async function ensureSelfOriginClientUrls(
  dataAdapter: ReturnType<typeof createAdapters>,
  tenantId: string,
  origin: string,
): Promise<void> {
  try {
    const client = await dataAdapter.clients.get(tenantId, "default");
    if (!client) return;
    const merge = (current: string[] | undefined, add: string[]) => {
      const set = new Set(current ?? []);
      let changed = false;
      for (const url of add) if (!set.has(url)) (set.add(url), (changed = true));
      return { list: [...set], changed };
    };
    const callbacks = merge(client.callbacks, [
      `${origin}/admin/auth-callback`,
      `${origin}/admin`,
    ]);
    const logout = merge(client.allowed_logout_urls, [`${origin}/admin`, origin]);
    const webOrigins = merge(client.web_origins, [origin]);
    if (callbacks.changed || logout.changed || webOrigins.changed) {
      await dataAdapter.clients.update(tenantId, "default", {
        callbacks: callbacks.list,
        allowed_logout_urls: logout.list,
        web_origins: webOrigins.list,
      });
    }
  } catch (err) {
    console.warn(`self-origin urls(${tenantId}):`, err instanceof Error ? err.message : err);
  }
}

/** Heal EVERY user whose username violates the schema ('@' forbidden): one
 *  invalid legacy row poisons the whole users LIST (response validation),
 *  while single-object endpoints keep working. The adapter read is raw (no
 *  response schema), so paging through it is safe. Idempotent. */
async function healInvalidUsernames(
  dataAdapter: ReturnType<typeof createAdapters>,
  tenantId: string,
): Promise<void> {
  try {
    for (let page = 0; page < 20; page++) {
      const batch = await dataAdapter.users.list(tenantId, {
        page,
        per_page: 100,
      });
      for (const user of batch.users) {
        if (!user.username?.includes("@")) continue;
        const local = user.username.split("@")[0] ?? user.username;
        await dataAdapter.users.update(tenantId, user.user_id, {
          username: local,
          // If the invalid username was their only identifier, keep them
          // reachable by making it the email.
          ...(!user.email ? { email: user.username, email_verified: true } : {}),
        });
      }
      if (batch.users.length < 100) break;
    }
  } catch (err) {
    console.warn(`heal usernames(${tenantId}):`, err instanceof Error ? err.message : err);
  }
}

/** Apply the configurable bootstrap: default_audience + admin credential
 *  upsert + email backfill + self-origin client URLs. Idempotent. */
async function applyBootstrap(
  dataAdapter: ReturnType<typeof createAdapters>,
  tenantId: string,
  cfg: Record<string, string | undefined>,
  origin?: string,
): Promise<void> {
  if (origin) await ensureSelfOriginClientUrls(dataAdapter, tenantId, origin);
  await healInvalidUsernames(dataAdapter, tenantId);
  try {
    await dataAdapter.tenants.update(tenantId, {
      default_audience: `urn:authhero:tenant:${tenantId}`,
    });
  } catch (err) {
    console.warn(`default_audience(${tenantId}):`, err instanceof Error ? err.message : err);
  }
  const identifier = cfg.ADMIN_USERNAME;
  const password = cfg.ADMIN_PASSWORD;
  if (!identifier || !password) return;
  // The User schema forbids '@' in username ("use the email field") — but the
  // adapter write path doesn't validate, so an email-shaped username STORES
  // and then 500s the users list on read. An email-shaped identifier is the
  // EMAIL; username is its local part.
  const isEmail = identifier.includes("@");
  const username = isEmail ? (identifier.split("@")[0] ?? identifier) : identifier;
  try {
    const found = await dataAdapter.users.list(tenantId, {
      q: isEmail ? `email:${identifier}` : `username:${identifier}`,
    });
    const user = found.users[0];
    if (user) {
      const { hash, algorithm } = await hashPassword(password);
      await dataAdapter.passwords.update(tenantId, {
        user_id: user.user_id,
        password: hash,
        algorithm,
        is_current: true,
      });
      // Heal schema violations from earlier bootstraps: '@' in username.
      const patch: { email?: string; email_verified?: boolean; username?: string } = {};
      if (isEmail && user.email !== identifier) {
        patch.email = identifier;
        patch.email_verified = true;
      }
      if (user.username?.includes("@")) patch.username = username;
      if (Object.keys(patch).length > 0) {
        await dataAdapter.users.update(tenantId, user.user_id, patch);
      }
    } else {
      // No user under that identifier yet: create through seed's own path.
      await seed(dataAdapter, {
        adminUsername: username,
        ...(isEmail ? { adminEmail: identifier } : {}),
        adminPassword: password,
        tenantId,
        isControlPlane: false,
        debug: false,
      });
    }
  } catch (err) {
    console.warn(`admin bootstrap(${tenantId}):`, err instanceof Error ? err.message : err);
  }
}

// ── /internal/provision — the K-31 ready-gate, both halves ───────────────────

const provisionBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  owner: principalIdOf,
  slug: z.string().min(1),
  name: z.string().min(1),
  entitlements: z.array(entitlementGrant).optional(),
  /** Per-instance config (#310 companion) — carries admin bootstrap when the
   *  platform provides it; a generated credential is returned otherwise. */
  config: z.record(z.string(), z.string()).optional(),
});

app.post("/internal/provision", async (c) => {
  gatePlatform(c);
  const body = provisionBody.parse(await c.req.json());

  // Half 1: the kernel scope — roles + the platform-delivered entitlement
  // projection, which ctx.entitlement reads at request time (#304).
  await hostFor(c.env).provisionScopeLocal({
    tenantId: body.tenantId,
    scopeId: body.scopeId,
    owner: body.owner,
    roles: ROLES,
    ownerRoleKey: OWNER_ROLE,
    ...(body.entitlements ? { entitlements: body.entitlements } : {}),
  });

  // Half 2: the tenant D1 — migrate to the bundled frontier, then seed a
  // WORKING tenant. Both idempotent; a retried drain converges.
  const db = tenantDb(c.env, body.tenantId);
  const store = d1TenantRelationalStore(db);
  const { applied } = await applyMigrations(store);

  const dataAdapter = createAdapters(drizzle(db, { schema }), {
    useTransactions: false,
  });
  const issuer = `${new URL(c.req.raw.url).origin}/`;
  const adminIdentifier =
    body.config?.ADMIN_USERNAME ?? `admin@${body.slug}.local`;
  const adminPassword = body.config?.ADMIN_PASSWORD ?? `${ulid()}aA1!`;
  // Email-shaped identifier → EMAIL (the login lookup key); username = local
  // part (the User schema forbids '@' in usernames — see applyBootstrap).
  const adminEmail = adminIdentifier.includes("@") ? adminIdentifier : undefined;
  const adminUsername = adminEmail
    ? (adminIdentifier.split("@")[0] ?? adminIdentifier)
    : adminIdentifier;
  let seedError: string | undefined;
  const seeded = await seed(dataAdapter, {
    adminUsername,
    ...(adminEmail ? { adminEmail } : {}),
    adminPassword,
    issuer,
    tenantId: body.tenantId,
    tenantName: body.name,
    isControlPlane: false,
    debug: false,
  }).catch((err: unknown) => {
    seedError = err instanceof Error ? err.message : String(err);
    console.warn(`seed(${body.tenantId}):`, seedError);
    return undefined;
  });

  // Persist install-delivered config + the owner-of-record, then apply the
  // configurable bootstrap (default_audience, admin credential upsert).
  await putConfigEntries(store, [
    ...Object.entries(body.config ?? {}).map(([key, value]) => ({ key, value })),
    { key: "__owner", value: body.owner },
  ]);
  await applyBootstrap(dataAdapter, body.tenantId, await getStoredConfig(store), new URL(c.req.raw.url).origin);

  return c.json(
    {
      tenantId: body.tenantId,
      scopeId: body.scopeId,
      migrationsApplied: applied,
      clientId: seeded?.clientId,
      ...(seedError ? { seedError } : {}),
      // Dev-channel spike affordance: surfaced once via the intent result so
      // the console operator gets the tenant's first login. Replace with an
      // invite/reset flow before any real audience.
      adminUsername: seeded ? adminIdentifier : undefined,
      adminPassword:
        seeded && !body.config?.ADMIN_PASSWORD ? adminPassword : undefined,
    },
    201,
  );
});

// ── /internal/configure — settings delivery (key-by-key upserts, then apply) ─

const configureBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  entries: z.array(z.object({ key: z.string().min(1), value: z.string() })),
});

app.post("/internal/configure", async (c) => {
  gatePlatform(c);
  const body = configureBody.parse(await c.req.json());
  const db = tenantDb(c.env, body.tenantId);
  const store = d1TenantRelationalStore(db);
  await putConfigEntries(store, body.entries);
  const dataAdapter = createAdapters(drizzle(db, { schema }), {
    useTransactions: false,
  });
  await applyBootstrap(dataAdapter, body.tenantId, await getStoredConfig(store), new URL(c.req.raw.url).origin);
  return c.json({ ok: true, applied: body.entries.map((e) => e.key) });
});

// ── /internal/reconcile — the builder-triggerable repair (#332 shape) ────────
// Re-runs the idempotent provision: kernel scope re-projected (owner re-sourced
// from our own owner-of-record), entitlements re-delivered by the platform,
// migrations + bootstrap re-applied from stored config.

const reconcileBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  entitlements: z.array(entitlementGrant).optional(),
});

app.post("/internal/reconcile", async (c) => {
  gatePlatform(c);
  const body = reconcileBody.parse(await c.req.json());
  const db = tenantDb(c.env, body.tenantId);
  const store = d1TenantRelationalStore(db);
  const cfg = await getStoredConfig(store);
  const storedOwner = principalIdOf.safeParse(cfg.__owner ?? "");
  if (!storedOwner.success) {
    return c.json(
      { error: "no owner-of-record for this instance — provision it first" },
      409,
    );
  }
  await hostFor(c.env).provisionScopeLocal({
    tenantId: body.tenantId,
    scopeId: body.scopeId,
    owner: storedOwner.data,
    roles: ROLES,
    ownerRoleKey: OWNER_ROLE,
    ...(body.entitlements ? { entitlements: body.entitlements } : {}),
  });
  await applyMigrations(store);
  const dataAdapter = createAdapters(drizzle(db, { schema }), {
    useTransactions: false,
  });
  await applyBootstrap(dataAdapter, body.tenantId, cfg, new URL(c.req.raw.url).origin);
  return c.json({
    tenantId: body.tenantId,
    scopeId: body.scopeId,
    owner: storedOwner.data,
  });
});

// ── Platform introspection + the probe diagnostic (stand-in parity) ──────────

const probeBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  principal: principalIdOf,
  feature: z.string().min(1),
});
app.post("/internal/probe", async (c) => {
  gatePlatform(c);
  const body = probeBody.parse(await c.req.json());
  try {
    const stub = await hostFor(c.env).getScope(
      body.principal,
      body.tenantId,
      body.scopeId,
    );
    return c.json({
      ok: true,
      result: await stub.invoke("authcore/probe-feature", {
        feature: body.feature,
      }),
    });
  } catch (err) {
    return c.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      400,
    );
  }
});
app.get("/internal/tables", async (c) => {
  gatePlatform(c);
  return c.json(
    await hostFor(c.env).introspectScopeTables(
      scopeIdOf.parse(c.req.query("scopeId")),
    ),
  );
});
app.get("/internal/tables/:table", async (c) => {
  gatePlatform(c);
  const scope = scopeIdOf.parse(c.req.query("scopeId"));
  const input = readScopeTableInput.parse({
    table: c.req.param("table"),
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    offset: c.req.query("offset") ? Number(c.req.query("offset")) : undefined,
  });
  return c.json(await hostFor(c.env).introspectScopeTable(scope, input));
});
app.post("/internal/query", async (c) => {
  gatePlatform(c);
  const body = queryScopeInput
    .extend({ scopeId: scopeIdOf })
    .parse(await c.req.json());
  return c.json(
    await hostFor(c.env).introspectScopeQuery(body.scopeId, { sql: body.sql }),
  );
});
app.post("/internal/delete-scope", async (c) => {
  gatePlatform(c);
  const body = z.object({ scopeId: scopeIdOf }).parse(await c.req.json());
  await hostFor(c.env).deleteScopeLocal(body.scopeId);
  return c.json({ deleted: body.scopeId });
});

// ── Everything else IS AuthHero ──────────────────────────────────────────────

// Per-isolate runtime cache; rebuilt on isolate recycle. Keyed by tenant.
const runtimes = new Map<
  string,
  {
    app: ReturnType<typeof init>["app"];
    dataAdapter: ReturnType<typeof createAdapters>;
  }
>();

function runtimeFor(env: Env, tenant: TenantId, issuer: string) {
  const cached = runtimes.get(tenant);
  if (cached) return cached;
  const db = tenantDb(env, tenant);
  const dataAdapter = createAdapters(drizzle(db, { schema }), {
    useTransactions: false,
  });
  const config: AuthHeroConfig = {
    dataAdapter,
    allowedOrigins: [new URL(issuer).origin],
    widgetHandler,
    adminHandler,
    adminIndexHtml: adminIndexFor(issuer, "default"),
  };
  const runtime = { app: init(config).app, dataAdapter };
  runtimes.set(tenant, runtime);
  return runtime;
}

app.all("*", async (c) => {
  const tenant = tenantFor(c.req.raw, c.env);
  const issuer = `${new URL(c.req.raw.url).origin}/`;
  const runtime = runtimeFor(c.env, tenant, issuer);
  return runtime.app.fetch(c.req.raw, {
    ISSUER: issuer,
    AUTH_URL: issuer,
    ENVIRONMENT: "production",
    JWKS_CACHE_TIMEOUT_IN_SECONDS: 600,
    ORGANIZATION_NAME: "AuthHero",
    data: runtime.dataAdapter,
  });
});

export default app;
