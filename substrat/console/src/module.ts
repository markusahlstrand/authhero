// The operations + module registrations. Module code: reachable from a
// ModuleRegistration, so it obeys the layer rules — data access is ctx.sql only,
// no fetch, no node:*, every operation checks a permission first, every mutation
// emits a fat event.
//
// Platform effects (create a tenant, grant entitlements) are PRIVILEGED: this
// module never performs them. It enqueues a typed intent via ctx.requestPlatform
// (platform-intents.md; docs/provisioning-capability.md §8) and the platform
// drains + effects it with HostAdmin authority. Locally the same drain engine
// runs against the CP-full sqlite host (src/platform-handlers.ts) — one code
// path, dev and hosted.
import {
  assertAllowed,
  ulid,
  type ModuleRegistration,
  type OperationHandler,
} from "@substrat-run/kernel";
import { z } from "@substrat-run/contracts";
import {
  AUTHCORE_PERM,
  CP_PERM,
  authcoreManifest,
  controlplaneManifest,
} from "./manifest.js";
import { authcoreMigrations, controlplaneMigrations } from "./migrations.js";
import {
  AUTHCORE_VERTICAL,
  FEATURE_ENTITLEMENT,
  PLAN_ENTITLEMENTS,
  planSchema,
  type Plan,
} from "./policy.js";
import { PROVISION_TENANT_KIND, SET_ENTITLEMENTS_KIND } from "./intents.js";

// ---------------------------------------------------------------------------
// controlplane — runs in the platform console scope
// ---------------------------------------------------------------------------

const registerInput = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  plan: planSchema,
});

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  plan: string;
  auth_scope_id: string;
}

const planGrants = (plan: Plan) =>
  (PLAN_ENTITLEMENTS[plan] ?? []).map((key) => ({ key, plan }));

// The tenant's platform status, derived — never stored (§9.1): the intent spine
// is the truth about in-flight/failed provisioning today, and the §9
// managed-tenants projection will be the truth about the rest once it ships.
// Reads of _substrat_* spine tables are allowed (rule 3); writes never.
function provisioningStatusByTenant(ctx: {
  sql: {
    query<T>(sql: string, params?: readonly (string | number | null)[]): T[];
  };
}): Map<string, string> {
  const rows = ctx.sql.query<{ payload: string; status: string }>(
    "SELECT payload, status FROM _substrat_platform_requests WHERE kind = ? ORDER BY id",
    [PROVISION_TENANT_KIND],
  );
  const byTenant = new Map<string, string>();
  for (const row of rows) {
    try {
      const parsed = z
        .object({ tenant: z.object({ id: z.string() }) })
        .parse(JSON.parse(row.payload));
      byTenant.set(parsed.tenant.id, row.status); // later intents win (ORDER BY id)
    } catch {
      // a foreign/malformed payload is not ours to interpret
    }
  }
  return byTenant;
}

// Register a customer tenant. Writes the console-owned record (ids, metadata,
// plan) and asks the platform — via a provision-tenant intent — to effect the
// privileged part: createTenant + the auth-core scope + entitlements. The
// proposed ids are an idempotent join key, not a fact: the tenant is
// `provisioning` until the platform settles the intent. Idempotent on slug.
const registerTenant: OperationHandler = async (ctx, input) => {
  assertAllowed(await ctx.check(CP_PERM.provision));
  const { slug, name, plan } = registerInput.parse(input);

  const [existing] = ctx.sql.query<TenantRow>(
    "SELECT id, slug, name, plan, auth_scope_id FROM controlplane_tenant WHERE slug = ?",
    [slug],
  );
  if (existing) {
    return {
      tenantId: existing.id,
      authScopeId: existing.auth_scope_id,
      slug: existing.slug,
      name: existing.name,
      plan: existing.plan,
      reused: true,
    };
  }

  const tenantId = ulid();
  const authScopeId = ulid();
  const entitlements = planGrants(plan);
  const createdAt = new Date().toISOString();

  ctx.sql.exec(
    "INSERT INTO controlplane_tenant (id, slug, name, plan, auth_scope_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [tenantId, slug, name, plan, authScopeId, createdAt],
  );

  ctx.emit({
    type: "console.tenant-registered",
    schemaVersion: 1,
    entity: { entityType: "tenant", entityId: tenantId },
    // Org-level data (a tenant's slug/name), not a natural person's PII.
    piiClass: "none",
    payload: {
      tenantId,
      authScopeId,
      slug,
      name,
      plan,
      targetVertical: AUTHCORE_VERTICAL,
    },
  });

  // The privileged ask — atomic with this transaction, effected by the platform
  // drain. Enqueued AFTER the permission check (authorization is the vertical's;
  // isolation is the platform's).
  const requestId = ctx.requestPlatform({
    kind: PROVISION_TENANT_KIND,
    payload: {
      tenant: { id: tenantId, slug, name },
      instance: {
        vertical: AUTHCORE_VERTICAL,
        scopeId: authScopeId,
        slug: `${slug}-auth`,
        name,
        owner: ctx.principal,
      },
      entitlements,
    },
  });

  return {
    tenantId,
    authScopeId,
    slug,
    name,
    plan,
    status: "provisioning",
    requestId,
    reused: false,
  };
};

const listTenants: OperationHandler = async (ctx) => {
  assertAllowed(await ctx.check(CP_PERM.read));
  const rows = ctx.sql.query<TenantRow & { created_at: string }>(
    "SELECT id, slug, name, plan, auth_scope_id, created_at FROM controlplane_tenant ORDER BY created_at, id",
  );
  const intents = provisioningStatusByTenant(ctx);
  return rows.map((row) => {
    const intent = intents.get(row.id);
    const status =
      intent === "pending"
        ? "provisioning"
        : intent === "failed"
          ? "failed"
          : "active";
    return { ...row, status };
  });
};

const setPlanInput = z.object({
  tenantId: z.string().min(1),
  plan: planSchema,
});

// Change a tenant's plan. Updates the console-owned plan choice and asks the
// platform to reconcile the tenant's entitlements to it (§9.1's split: the grant
// state is the platform's fact) — the design's §9.1 "plan upgrade → enforceable
// entitlement" flow.
const setPlan: OperationHandler = async (ctx, input) => {
  assertAllowed(await ctx.check(CP_PERM.planManage));
  const { tenantId, plan } = setPlanInput.parse(input);

  const rows = ctx.sql.query<{ id: string; auth_scope_id: string }>(
    "SELECT id, auth_scope_id FROM controlplane_tenant WHERE id = ?",
    [tenantId],
  );
  const row = rows[0];
  if (!row) throw new Error(`unknown tenant: ${tenantId}`);

  const entitlements = planGrants(plan);
  ctx.sql.exec("UPDATE controlplane_tenant SET plan = ? WHERE id = ?", [
    plan,
    tenantId,
  ]);

  ctx.emit({
    type: "console.plan-changed",
    schemaVersion: 1,
    entity: { entityType: "tenant", entityId: tenantId },
    piiClass: "none",
    payload: { tenantId, plan, entitlements: entitlements.map((e) => e.key) },
  });

  const requestId = ctx.requestPlatform({
    kind: SET_ENTITLEMENTS_KIND,
    payload: { tenantId, authScopeId: row.auth_scope_id, plan, entitlements },
  });

  return { tenantId, plan, requestId };
};

// ---------------------------------------------------------------------------
// authcore — the WFP auth-core stand-in, runs in each customer scope
// ---------------------------------------------------------------------------

const probeInput = z.object({ feature: z.string().min(1) });

// The entitlements read-port (design §5.4). The auth core asks "is this tenant
// entitled to <feature>?" at the point the limited resource is created; the kernel
// answers from the tenant's currently-held grants. A non-null view is by
// construction live (expiry applied at read).
const probeFeature: OperationHandler = async (ctx, input) => {
  assertAllowed(await ctx.check(AUTHCORE_PERM.featureCheck));
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

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export const controlplaneModule: ModuleRegistration = {
  manifest: controlplaneManifest,
  migrations: controlplaneMigrations,
  operations: {
    "controlplane/register-tenant": registerTenant,
    "controlplane/list-tenants": listTenants,
    "controlplane/set-plan": setPlan,
  },
};

export const authcoreModule: ModuleRegistration = {
  manifest: authcoreManifest,
  migrations: authcoreMigrations,
  operations: {
    "authcore/probe-feature": probeFeature,
  },
};
