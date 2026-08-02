// Node harness for the REAL auth core on the Substrat tenant-store contract
// (design stage 1a). The pure-sqlite adapter implements provisionTenantStore /
// openTenantStore COMPLETELY (one .sqlite per tenant, native = better-sqlite3),
// so this harness proves the whole Stage-1 integration today; the Cloudflare
// worker (worker.ts) ships the same shape and lights up when Substrat wires
// #301 PR-2 (live D1 minting).
//
// Wire-compatible with the console's local platform driver: POST
// /internal/provision with the same body the auth-core stand-in accepts —
// point AUTHCORE_URL at this server and `register-tenant` in the console
// provisions a REAL, working IdP (migrations + seed → tenant + admin + client
// + signing keys), served per tenant on the catch-all below.
//
// Harness notes (deliberate Stage-1a divergences from hosted):
// - No kernel scope here: entitlement projection was proven via the stand-in;
//   this harness proves the AUTH side. Hosted, both live in worker.ts.
// - Tenant selection per request: `x-tenant` header (the harness serves many
//   tenants from one origin). Inside a tenant's app, authhero's own
//   tenantMiddleware single-tenant auto-detect does the real work — each store
//   holds exactly one tenant.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { Database } from "better-sqlite3";
import createAdapters from "@authhero/drizzle";
import * as schema from "@authhero/drizzle/schema/sqlite";
import { init, seed, type AuthHeroConfig } from "authhero";
import { SqliteScopeHost } from "@substrat-run/adapter-sqlite";
import {
  platformActorId,
  tenantId as tenantIdOf,
  z,
} from "@substrat-run/contracts";
import {
  assertPlatformCall,
  PlatformCallError,
  ulid,
  type ScopeHost,
  type TenantRelationalStore,
} from "@substrat-run/kernel";
import { mkdirSync } from "node:fs";
import { applyMigrations } from "./store.js";

const PORT = Number(process.env.PORT ?? 8790);
const DATA_DIR = process.env.DATA_DIR ?? ".data/auth-core";
const PLATFORM_SECRET = process.env.PLATFORM_SECRET ?? "devsecret";
const ISSUER = process.env.ISSUER ?? `http://localhost:${PORT}/`;
const VERTICAL = "authhero-auth-core";
const STORE_BINDING = "AUTH_DB";

mkdirSync(DATA_DIR, { recursive: true });
const host: ScopeHost = new SqliteScopeHost({ dir: DATA_DIR });
const ACTOR = platformActorId.parse(ulid());

/** Narrow the store's opaque native handle to a better-sqlite3 Database. */
function nativeDb(store: TenantRelationalStore): Database {
  const native: unknown = store.native;
  if (
    typeof native === "object" &&
    native !== null &&
    "prepare" in native &&
    "pragma" in native
  ) {
    return native as unknown as Database;
  }
  throw new Error(
    "tenant store native handle is not a better-sqlite3 Database",
  );
}

interface TenantRuntime {
  app: ReturnType<typeof init>["app"];
  dataAdapter: ReturnType<typeof createAdapters>;
}
const runtimes = new Map<string, TenantRuntime>();

async function runtimeFor(tenant: string): Promise<TenantRuntime> {
  const cached = runtimes.get(tenant);
  if (cached) return cached;
  // Idempotent re-resolve: same (tenant, vertical, binding) → same store.
  const handle = await host.provisionTenantStore(ACTOR, {
    tenantId: tenantIdOf.parse(tenant),
    vertical: VERTICAL,
    binding: STORE_BINDING,
  });
  const store = host.openTenantStore(handle);
  const db = drizzle(nativeDb(store), { schema });
  const dataAdapter = createAdapters(db);
  const config: AuthHeroConfig = { dataAdapter, allowedOrigins: ["*"] };
  const runtime: TenantRuntime = { app: init(config).app, dataAdapter };
  runtimes.set(tenant, runtime);
  return runtime;
}

const app = new Hono();

app.get("/health", (c) =>
  c.json({
    ok: true,
    vertical: VERTICAL,
    standIn: false,
    tenants: runtimes.size,
  }),
);

function gatePlatform(headers: Headers): void {
  try {
    assertPlatformCall(headers, { expectedSecret: PLATFORM_SECRET });
  } catch (e) {
    if (e instanceof PlatformCallError)
      throw new HTTPException(403, { message: e.message });
    throw e;
  }
}

const provisionBody = z.object({
  tenantId: z.string().min(1),
  scopeId: z.string().min(1).optional(),
  owner: z.string().min(1).optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  // Accepted for wire-compat with the platform/driver; the entitlement
  // projection lives in the kernel scope (worker.ts hosted) — not here.
  entitlements: z.array(z.unknown()).optional(),
});

// The K-31 provision: mint/resolve the tenant store, migrate it to the bundled
// frontier, seed a WORKING tenant (admin user, password connection, default
// client, signing keys). Idempotent end to end — a retried drain converges.
app.post("/internal/provision", async (c) => {
  gatePlatform(c.req.raw.headers);
  const body = provisionBody.parse(await c.req.json());
  const tId = tenantIdOf.parse(body.tenantId);

  // The directory row gates provisionTenantStore (active tenant required).
  await host.admin.createTenant(ACTOR, {
    id: tId,
    slug: body.slug,
    name: body.name,
  });
  const handle = await host.provisionTenantStore(ACTOR, {
    tenantId: tId,
    vertical: VERTICAL,
    binding: STORE_BINDING,
  });
  const store = host.openTenantStore(handle);
  const { applied } = await applyMigrations(store);

  const db = drizzle(nativeDb(store), { schema });
  const dataAdapter = createAdapters(db);
  const adminUsername = `admin@${body.slug}.local`;
  const adminPassword = `${ulid()}aA1!`; // spike credential — returned once, below
  const seeded = await seed(dataAdapter, {
    adminUsername,
    adminPassword,
    issuer: ISSUER,
    tenantId: body.tenantId,
    tenantName: body.name,
    isControlPlane: false,
    debug: false,
  }).catch((err: unknown) => {
    // seed is idempotent by intent; a re-run over an existing tenant may
    // partially no-op. Surface the message but do not fail the provision.
    console.warn(
      `seed(${body.tenantId}):`,
      err instanceof Error ? err.message : err,
    );
    return undefined;
  });

  runtimes.delete(body.tenantId); // rebuild the cached app over the seeded store
  return c.json(
    {
      tenantId: body.tenantId,
      storeRef: handle.ref,
      migrationsApplied: applied,
      clientId: seeded?.clientId,
      clientSecret: seeded?.clientSecret,
      adminUsername: seeded ? adminUsername : undefined,
      adminPassword: seeded ? adminPassword : undefined,
    },
    201,
  );
});

// Everything else IS AuthHero — the real app, per tenant. The harness picks the
// tenant from the x-tenant header; the app's own tenantMiddleware then
// auto-detects the single tenant inside that store.
app.all("*", async (c) => {
  const tenant = c.req.header("x-tenant");
  if (!tenant) {
    return c.json(
      {
        error:
          "pass x-tenant: <tenantId> (harness-only routing; hosted, the router asserts it)",
      },
      400,
    );
  }
  const runtime = await runtimeFor(tenant).catch((err: unknown) => {
    console.error(err);
    return null;
  });
  if (!runtime) return c.json({ error: `unknown tenant: ${tenant}` }, 404);
  return runtime.app.fetch(c.req.raw, {
    ISSUER,
    AUTH_URL: ISSUER,
    ENVIRONMENT: "development",
    JWKS_CACHE_TIMEOUT_IN_SECONDS: 600,
    ORGANIZATION_NAME: "AuthHero",
    data: runtime.dataAdapter,
  });
});

serve({ fetch: app.fetch, port: PORT });
console.log(`auth-core (REAL, node harness) on http://localhost:${PORT}`);
console.log(
  `  provision: POST /internal/provision (x-substrat-platform: ${PLATFORM_SECRET})`,
);
console.log(`  per-tenant stores under ${DATA_DIR}/`);
