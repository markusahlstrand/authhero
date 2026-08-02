/**
 * Cloudflare Worker entry — the console's platform deployment target.
 *
 * A SECOND entry point next to src/server.ts (the Node/tsx dev harness): the same
 * kernel + controlplane module, on `@substrat-run/adapter-cloudflare` (DO-per-
 * scope) instead of the pure-SQLite adapter. Sandbox-clean and CP-less: the only
 * durable store is the vertical's OWN `SCOPE` DO class; provisioning is pull
 * (`/internal/provision`), and the console's own privileged asks (create a
 * customer tenant, reconcile entitlements) leave as PLATFORM INTENTS the platform
 * pulls over `/internal/platform-requests` and effects with its own authority
 * (docs/provisioning-capability.md §8).
 *
 * Identity: an AuthHero access token (`Authorization: Bearer`) maps to the kernel
 * principal roles were granted to (oidc-auth.ts / identity.ts) — admins log in
 * *via* AuthHero as an RP, design §6. The `x-principal` dev seam survives ONLY
 * behind ALLOW_DEV_HEADER (local wrangler dev) — never set hosted.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  defineScopeDO,
  CloudflareScopeHost,
} from "@substrat-run/adapter-cloudflare";
import {
  principalId as principalIdOf,
  tenantId as tenantIdOf,
  scopeId as scopeIdOf,
  platformRequestId as platformRequestIdOf,
  queryScopeInput,
  readScopeTableInput,
  resolveEnvSpec,
  entitlementGrant,
  z,
  type PrincipalId,
  type TenantId,
  type ScopeId,
} from "@substrat-run/contracts";
import {
  assertPlatformCall,
  PlatformCallError,
  readRoutedNode,
  RouterAssertionError,
} from "@substrat-run/kernel";
import { controlplaneManifest } from "./manifest.js";
import { controlplaneModule } from "./module.js";
import { ROLES, OWNER_ROLE } from "./roles.js";
import { principalFromAuthHero, type OidcVerifyConfig } from "./oidc-auth.js";
import { principalForSub } from "./identity.js";
import { serveAsset } from "./assets.js";

// The code-time module set, bundled into the DO (a DO cannot receive handler
// closures over RPC). The console deployment serves ONLY console scopes — the
// auth core is its own vertical (authcore/), never a peer module here.
const MODULES = [controlplaneModule];

export const ScopeDO = defineScopeDO(MODULES, {});

interface Env {
  SCOPE: DurableObjectNamespace;
  /** Injected by the platform at dispatch; gates the /internal/* surface. */
  PLATFORM_SECRET?: string;
  /** The router's node-assertion secret (readRoutedNode). */
  ROUTER_SECRET?: string;
  /** OIDC config — declared in the manifest's envSpec; defaults applied there. */
  OIDC_ISSUER?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_AUDIENCE?: string;
  /** Local wrangler dev only — enables the x-principal/x-tenant/x-scope seam. */
  ALLOW_DEV_HEADER?: string;
  /** Local wrangler dev only — the default node when no router asserts one (the
   *  browser SPA sends only a Bearer). Hosted, the router always asserts. */
  DEV_TENANT?: string;
  DEV_SCOPE?: string;
}

interface Node {
  tenantId: TenantId;
  scopeId: ScopeId;
}

/** Rebuild the host PER REQUEST — a DO stub is an I/O object owned by the request. */
function hostFor(env: Env): CloudflareScopeHost {
  const host = new CloudflareScopeHost({ scope: env.SCOPE });
  for (const m of MODULES) host.registerModule(m);
  return host;
}

/** The manifest's envSpec resolved against the worker env — keys AND defaults. */
function appEnv(env: Env): Record<string, string | undefined> {
  return resolveEnvSpec(
    controlplaneManifest.envSpec ?? [],
    env as unknown as Record<string, unknown>,
  ).values;
}

function oidcCfg(env: Env): OidcVerifyConfig {
  const values = appEnv(env);
  return {
    issuer: values.OIDC_ISSUER ?? "",
    ...(values.OIDC_AUDIENCE ? { audience: values.OIDC_AUDIENCE } : {}),
  };
}

/** Which (tenant, scope) this request is for: router assertion, or the dev seam. */
function nodeFor(req: Request, env: Env): Node {
  let routed;
  try {
    routed = readRoutedNode(req.headers, { expectedSecret: env.ROUTER_SECRET });
  } catch (e) {
    if (e instanceof RouterAssertionError)
      throw new HTTPException(400, { message: e.message });
    throw e;
  }
  if (routed) return { tenantId: routed.tenantId, scopeId: routed.scopeId };
  if (env.ALLOW_DEV_HEADER === "true") {
    const tenant = req.headers.get("x-tenant") ?? env.DEV_TENANT ?? null;
    const scope = req.headers.get("x-scope") ?? env.DEV_SCOPE ?? null;
    if (tenant && scope) {
      return {
        tenantId: tenantIdOf.parse(tenant),
        scopeId: scopeIdOf.parse(scope),
      };
    }
  }
  throw new HTTPException(503, {
    message:
      "no scope was asserted for this request (missing router assertion)",
  });
}

/** Resolve the caller to a kernel principal: AuthHero bearer, or the dev seam. */
async function principalFor(
  req: Request,
  env: Env,
): Promise<PrincipalId | null> {
  if (env.ALLOW_DEV_HEADER === "true") {
    const dev = principalIdOf.safeParse(req.headers.get("x-principal") ?? "");
    if (dev.success) return dev.data;
  }
  const cfg = oidcCfg(env);
  if (!cfg.issuer) return null;
  const verified = await principalFromAuthHero(req.headers, cfg);
  return verified?.principal ?? null;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true, vertical: "authhero-console" }));

// ── The platform's /internal/* surface (secret-gated, never user-facing) ─────

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

const provisionBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  owner: principalIdOf,
  slug: z.string().min(1),
  name: z.string().min(1),
  entitlements: z.array(entitlementGrant).optional(),
  /** Install-time config (#426): OWNER_SUB = the AuthHero `sub` of the human
   *  operator — their OIDC login derives a DIFFERENT principal than the
   *  platform's install owner, so without this the installer logs in as
   *  role-none with no bootstrap affordance. */
  config: z.record(z.string(), z.string()).optional(),
});

// Provision ONE console scope on the platform's instruction (K-31), CP-less:
// migrate the module tables, project the roles + entitlements, grant the
// installing owner platform-operator at scope level. Idempotent.
app.post("/internal/provision", async (c) => {
  gatePlatform(c);
  const body = provisionBody.parse(await c.req.json());
  const host = hostFor(c.env);
  await host.provisionScopeLocal({
    tenantId: body.tenantId,
    scopeId: body.scopeId,
    owner: body.owner,
    roles: ROLES,
    ownerRoleKey: OWNER_ROLE,
    ...(body.entitlements ? { entitlements: body.entitlements } : {}),
  });
  // Bridge the two identities (#426 config): the platform's install owner got
  // the role above; OWNER_SUB additionally grants it to the principal the
  // operator's AuthHero login will DERIVE, so their first sign-in is already
  // platform-operator. Idempotent (tuple write is INSERT OR REPLACE).
  const ownerSub = body.config?.OWNER_SUB;
  if (ownerSub) {
    await host.assignScopeRole(
      body.scopeId,
      principalForSub(ownerSub),
      OWNER_ROLE,
    );
  }
  return c.json(
    {
      tenantId: body.tenantId,
      scopeId: body.scopeId,
      owner: body.owner,
      ...(ownerSub ? { operatorPrincipal: principalForSub(ownerSub) } : {}),
    },
    201,
  );
});

// Settings delivery (configureInstance → key-by-key entries). The console's one
// configurable bootstrap is OWNER_SUB; its effect (the role tuple) is durable in
// the scope, so applying IS persisting. OIDC_* entries are read from env
// (worker envSpec) — their per-install delivery is substrat#398's territory.
const configureBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  entries: z.array(z.object({ key: z.string().min(1), value: z.string() })),
});

app.post("/internal/configure", async (c) => {
  gatePlatform(c);
  const body = configureBody.parse(await c.req.json());
  const ownerSub = body.entries.find((e) => e.key === "OWNER_SUB")?.value;
  if (ownerSub) {
    await hostFor(c.env).assignScopeRole(
      body.scopeId,
      principalForSub(ownerSub),
      OWNER_ROLE,
    );
  }
  return c.json({
    ok: true,
    applied: ownerSub ? ["OWNER_SUB"] : [],
    ...(ownerSub ? { operatorPrincipal: principalForSub(ownerSub) } : {}),
  });
});

// The platform-intent pull surface (platform-intents.md Phase B1): the platform
// LISTS this scope's pending intents, effects them with its own authority, and
// SETTLES the outcomes back. This is how the console's provision-tenant /
// set-entitlements asks reach the platform without an upward call.
app.get("/internal/platform-requests", async (c) => {
  gatePlatform(c);
  const tenant = tenantIdOf.parse(c.req.query("tenantId"));
  const scope = scopeIdOf.parse(c.req.query("scopeId"));
  return c.json(await hostFor(c.env).listPlatformRequests(tenant, scope));
});
const settleBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  id: platformRequestIdOf,
  status: z.enum(["done", "failed", "pending"]),
  result: z.unknown().optional(),
  lastError: z.string().nullable().optional(),
});
app.post("/internal/platform-requests/settle", async (c) => {
  gatePlatform(c);
  const body = settleBody.parse(await c.req.json());
  await hostFor(c.env).settlePlatformRequest(
    body.tenantId,
    body.scopeId,
    body.id,
    {
      status: body.status,
      ...(body.result !== undefined ? { result: body.result } : {}),
      ...(body.lastError !== undefined ? { lastError: body.lastError } : {}),
    },
  );
  return c.json({ settled: body.id });
});

// Read-only scope introspection for the platform console's Data view.
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
  try {
    return c.json(
      await hostFor(c.env).introspectScopeQuery(body.scopeId, {
        sql: body.sql,
      }),
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes("read-only console")) {
      throw new HTTPException(400, { message: e.message });
    }
    throw e;
  }
});
app.get("/internal/export", async (c) => {
  gatePlatform(c);
  return c.json(
    await hostFor(c.env).exportScopeLocal(
      scopeIdOf.parse(c.req.query("scopeId")),
    ),
  );
});
app.post("/internal/delete-scope", async (c) => {
  gatePlatform(c);
  const body = z.object({ scopeId: scopeIdOf }).parse(await c.req.json());
  await hostFor(c.env).deleteScopeLocal(body.scopeId);
  return c.json({ deleted: body.scopeId });
});

// ── The app surface ──────────────────────────────────────────────────────────

// Who am I — the SPA reads this after login. Identity from the AuthHero token;
// the ROLE from the scope's own tuples (projected at provision). Best-effort: an
// authenticated caller with no tuple shows a null role, never a 500.
app.get("/me", async (c) => {
  const cfg = oidcCfg(c.env);
  const verified = cfg.issuer
    ? await principalFromAuthHero(c.req.raw.headers, cfg)
    : null;
  let principal = verified?.principal ?? null;
  if (!principal && c.env.ALLOW_DEV_HEADER === "true") {
    const dev = principalIdOf.safeParse(c.req.header("x-principal") ?? "");
    if (dev.success) principal = dev.data;
  }
  if (!principal) return c.json({ authenticated: false }, 401);
  const node = nodeFor(c.req.raw, c.env);
  let role: string | null = null;
  try {
    const q = await hostFor(c.env).introspectScopeQuery(node.scopeId, {
      sql: `SELECT relation FROM _substrat_tuples WHERE subject = 'principal:${principal}' AND relation LIKE 'role:%' AND revoked_at IS NULL`,
    });
    const rel = q.rows[0]?.[0];
    if (typeof rel === "string" && rel.startsWith("role:"))
      role = rel.slice("role:".length);
  } catch {
    // no tuples yet (fresh scope) — authenticated with no role is a real state
  }
  return c.json({
    authenticated: true,
    principalId: principal,
    role,
    email: verified?.claims.email ?? null,
  });
});

// /op/:module/:operation → getScope(principal, tenant, scope).invoke(op, body) —
// the same wire shape server.ts serves in dev, so the SPA is harness-agnostic.
const json = (body: unknown, status = 200) =>
  Response.json(body as Record<string, unknown>, { status });

const invokeOp = async (c: {
  env: Env;
  req: { raw: Request; param: (k: string) => string };
}) => {
  const node = nodeFor(c.req.raw, c.env);
  const principal = await principalFor(c.req.raw, c.env);
  if (!principal) return json({ ok: false, error: "not authenticated" }, 401);
  const op = `${c.req.param("module")}/${c.req.param("operation")}`;
  const body = (await c.req.raw.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  try {
    const stub = await hostFor(c.env).getScope(
      principal,
      node.tenantId,
      node.scopeId,
    );
    const result = await stub.invoke(op, body);
    return json({ ok: true, result: result ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = /permission denied|unknown scope|not entitled/i.test(message)
      ? 403
      : 400;
    return json({ ok: false, error: message }, status);
  }
};
app.post("/op/:module/:operation", (c) => invokeOp(c));
app.post("/api/op/:module/:operation", (c) => invokeOp(c));

// The SPA — inlined into the worker (no ASSETS binding), catch-all behind the
// API routes; /internal/* above always answers JSON and never falls through.
app.all("*", (c) => {
  const values = appEnv(c.env);
  return serveAsset(new URL(c.req.raw.url), {
    issuer: values.OIDC_ISSUER,
    clientId: values.OIDC_CLIENT_ID,
    audience: values.OIDC_AUDIENCE,
  });
});

export default app;
