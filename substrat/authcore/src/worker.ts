/**
 * The auth-core STAND-IN vertical — a self-contained Worker whose only job is to
 * prove the console → platform → instance chain: the console's provision-tenant
 * intent materializes a scope HERE (via the platform's provisionInstance →
 * /internal/provision), with the tenant's entitlements PROJECTED in (#310), and
 * the probe reads them via ctx.entitlement (#304) — the design's §5.4 read-port,
 * exercised hosted.
 *
 * Deliberately /internal-only (platform-secret-gated): no public operations, no
 * auth stack, no dev header — nothing to leak. The REAL auth core (the `authhero`
 * package on per-tenant D1) replaces this vertical wholesale in design stage 1.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  defineScopeDO,
  CloudflareScopeHost,
} from "@substrat-run/adapter-cloudflare";
import {
  moduleManifest,
  permissionKey,
  principalId as principalIdOf,
  tenantId as tenantIdOf,
  scopeId as scopeIdOf,
  readScopeTableInput,
  queryScopeInput,
  entitlementGrant,
  z,
} from "@substrat-run/contracts";
import {
  assertAllowed,
  assertPlatformCall,
  PlatformCallError,
  type ModuleRegistration,
  type OperationHandler,
} from "@substrat-run/kernel";

// ── The stand-in module (mirrors src/module.ts's authcore, kept inline so this
//    directory is independently pushable) ────────────────────────────────────

const FEATURE_ENTITLEMENT: Record<string, string> = {
  mfa: "authhero-mfa",
  "custom-domains": "authhero-custom-domains",
  saml: "authhero-saml",
};

const PERM_FEATURE_CHECK = permissionKey.parse("authcore:feature-check");

const manifest = moduleManifest.parse({
  id: "authcore",
  version: "0.0.0",
  kernelContract: "^0.0.1",
  permissions: [
    {
      key: PERM_FEATURE_CHECK,
      description:
        "Read the tenant's entitlement set at an enforcement point (the auth-core read-port).",
    },
  ],
  events: { emits: [], consumes: [] },
  migrations: { journalDir: "authcore", compatibleFrom: "0.0.0" },
  attachmentTargets: [],
  entitlementKey: "authhero-auth-core",
});

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

// ── Worker plumbing ──────────────────────────────────────────────────────────

const MODULES = [authcoreModule];
export const ScopeDO = defineScopeDO(MODULES, {});

interface Env {
  SCOPE: DurableObjectNamespace;
  PLATFORM_SECRET?: string;
}

function hostFor(env: Env): CloudflareScopeHost {
  const host = new CloudflareScopeHost({ scope: env.SCOPE });
  for (const m of MODULES) host.registerModule(m);
  return host;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) =>
  c.json({ ok: true, vertical: "authhero-auth-core", standIn: true }),
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

const provisionBody = z.object({
  tenantId: tenantIdOf,
  scopeId: scopeIdOf,
  owner: principalIdOf,
  slug: z.string().min(1),
  name: z.string().min(1),
  entitlements: z.array(entitlementGrant).optional(),
});

// The platform materializes an instance here (K-31 pull). The projected
// entitlements are what probe-feature later reads — the #310 delivery.
app.post("/internal/provision", async (c) => {
  gatePlatform(c);
  const body = provisionBody.parse(await c.req.json());
  await hostFor(c.env).provisionScopeLocal({
    tenantId: body.tenantId,
    scopeId: body.scopeId,
    owner: body.owner,
    roles: [
      {
        key: "auth-admin",
        permissions: [PERM_FEATURE_CHECK],
        source: "vertical",
      },
    ],
    ownerRoleKey: "auth-admin",
    ...(body.entitlements ? { entitlements: body.entitlements } : {}),
  });
  return c.json(
    { tenantId: body.tenantId, scopeId: body.scopeId, owner: body.owner },
    201,
  );
});

// Probe the entitlement read-port AS a principal — platform-gated (this is a
// diagnostic on a stand-in, not a public API).
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
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ ok: false, error: message }, 400);
  }
});

// Introspection for the platform console's Data view.
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

export default app;
