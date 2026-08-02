// PLATFORM-side intent handlers — harness code, NOT module code. These run with
// HostAdmin authority, which is exactly what the sandbox denies module code; the
// module only enqueues (src/intents.ts), the drain effects.
//
// Written in control-plane-api's `PlatformRequestHandler` signature so they are
// LIFTABLE: Substrat's platform drain registers the same shape (mirroring
// `provisionSiblingHandler`), swapping `host.admin` for ControlPlaneClient /
// provisionInstance and enforcing §8.2's invariants (staff-granted provisioner
// capability, provisionedBy ownership, declared-SKU bound, declared target
// vertical). Locally the CP-full SqliteScopeHost plays the platform.
import {
  drainScopePlatformRequests,
  type PlatformRequestContext,
  type PlatformRequestHandler,
} from "@substrat-run/control-plane-api";
import {
  scopeId as scopeIdOf,
  tenantId as tenantIdOf,
  type PlatformActorId,
  type PrincipalId,
} from "@substrat-run/contracts";
import type { ScopeHost } from "@substrat-run/kernel";
import { AUTHCORE_PERM } from "./manifest.js";
import { ALL_FEATURE_ENTITLEMENTS, AUTHCORE_ENTITLEMENT } from "./policy.js";
import {
  PROVISION_TENANT_KIND,
  SET_ENTITLEMENTS_KIND,
  provisionTenantPayload,
  setEntitlementsPayload,
} from "./intents.js";
import { CONSOLE_SCOPE, PLATFORM_TENANT } from "./constants.js";

export interface LocalPlatformDeps {
  host: ScopeHost;
  actor: PlatformActorId;
  /** The service principal the auth core reads entitlements as (feature-check grant). */
  authcoreReader: PrincipalId;
}

// The §8.2-invariant-3 SKU universe. Locally this stands in for the manager's
// declared `manifest.entitlements`; the platform handler reads the real manifest.
const DECLARED_SKUS = ALL_FEATURE_ENTITLEMENTS;

/**
 * `provision-tenant`: createTenant → first scope (payload's vertical, NOT
 * inherited) → activate → entitlements → the auth-core reader grant. Every step
 * is idempotent on the payload's proposed ids, so an at-least-once drain
 * converges (two-phase: the ids land in `result`).
 */
export function provisionTenantHandler(
  deps: LocalPlatformDeps,
): PlatformRequestHandler {
  return async (_ctx, request) => {
    const p = provisionTenantPayload.parse(request.payload);
    const tId = tenantIdOf.parse(p.tenant.id);
    const sId = scopeIdOf.parse(p.instance.scopeId);

    for (const grant of p.entitlements) {
      if (!DECLARED_SKUS.includes(grant.key)) {
        return {
          status: "failed",
          error: `entitlement '${grant.key}' is not among the manager's declared SKUs`,
        };
      }
    }

    await deps.host.admin.createTenant(deps.actor, {
      id: tId,
      slug: p.tenant.slug,
      name: p.tenant.name,
    });
    await deps.host.provisionScope(deps.actor, {
      tenantId: tId,
      scopeId: sId,
      vertical: p.instance.vertical,
      jurisdiction: "eu",
      slug: p.instance.slug,
      name: p.instance.name,
    });
    await deps.host.admin.activateScope(deps.actor, tId, sId);

    await deps.host.admin.grantEntitlement(
      deps.actor,
      tId,
      AUTHCORE_ENTITLEMENT,
    );
    for (const grant of p.entitlements) {
      await deps.host.admin.grantEntitlement(deps.actor, tId, grant.key, {
        plan: grant.plan,
      });
    }

    await deps.host.admin.grant(deps.actor, {
      principalId: deps.authcoreReader,
      permission: AUTHCORE_PERM.featureCheck,
      node: { tenantId: tId, scopeId: sId },
      grantedBy: deps.authcoreReader,
    });

    return { status: "done", result: { tenantId: tId, scopeId: sId } };
  };
}

/**
 * `set-entitlements`: reconcile a managed tenant's grants to the payload's target
 * set. The declared SKU universe bounds BOTH sides — grant what's in the target,
 * revoke what's declared but absent — so a lapsed plan revokes cleanly and the
 * handler never touches keys the manager does not own. Idempotent.
 */
export function setEntitlementsHandler(
  deps: LocalPlatformDeps,
): PlatformRequestHandler {
  return async (_ctx, request) => {
    const p = setEntitlementsPayload.parse(request.payload);
    const tId = tenantIdOf.parse(p.tenantId);
    const target = new Map(p.entitlements.map((e) => [e.key, e.plan]));

    for (const key of target.keys()) {
      if (!DECLARED_SKUS.includes(key)) {
        return {
          status: "failed",
          error: `entitlement '${key}' is not among the manager's declared SKUs`,
        };
      }
    }
    for (const key of DECLARED_SKUS) {
      if (target.has(key)) {
        await deps.host.admin.grantEntitlement(deps.actor, tId, key, {
          plan: target.get(key),
        });
      } else {
        await deps.host.admin.revokeEntitlement(deps.actor, tId, key);
      }
    }
    return { status: "done", result: { tenantId: tId, plan: p.plan } };
  };
}

/**
 * Drain the console scope's pending intents through control-plane-api's REAL
 * drain engine — the same code path the hosted platform runs; only the transport
 * (the host itself vs a VerticalClient over HTTP) and the handlers' authority
 * source differ. Locally called after seed and eagerly after mutating ops
 * (hosted, the platform sweep + an eager drain do this).
 */
export async function drainConsole(deps: LocalPlatformDeps) {
  const ctx: PlatformRequestContext = {
    tenantId: PLATFORM_TENANT,
    scopeId: CONSOLE_SCOPE,
    vertical: "authhero-console",
  };
  return drainScopePlatformRequests(deps.host, ctx, {
    [PROVISION_TENANT_KIND]: provisionTenantHandler(deps),
    [SET_ENTITLEMENTS_KIND]: setEntitlementsHandler(deps),
  });
}
