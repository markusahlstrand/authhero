// The console ⇄ platform intent contract (docs/provisioning-capability.md §8).
// Pure data — kind strings + payload schemas — shared between module code (which
// ENQUEUES via ctx.requestPlatform) and the platform-side handlers (which PARSE
// at drain time). This file is the wire contract Substrat's handlers must match.
import { z } from "@substrat-run/contracts";

// Create a new customer tenant + its first scope (any declared vertical) + its
// entitlements. §8.1's shape verbatim.
export const PROVISION_TENANT_KIND = "provision-tenant";
export const provisionTenantPayload = z.object({
  tenant: z.object({
    // Proposed by the vertical as an idempotent join key (§8.5 Q1); the platform
    // enforces uniqueness/ownership. createTenant is idempotent on the id.
    id: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
  }),
  instance: z.object({
    vertical: z.string().min(1), // must be in the manager's declared `provisions` (§8.2 inv 4)
    scopeId: z.string().min(1),
    slug: z.string().min(1),
    name: z.string().min(1),
    owner: z.string().min(1),
  }),
  // SKUs to grant + project into the new scope (#310). Restricted to the
  // manager's declared `manifest.entitlements` (§8.2 inv 3).
  entitlements: z.array(
    z.object({ key: z.string().min(1), plan: z.string().nullable() }),
  ),
  config: z.record(z.string(), z.string()).optional(),
});
export type ProvisionTenantPayload = z.infer<typeof provisionTenantPayload>;

// Reconcile a managed tenant's entitlements to a new plan. The payload names the
// TARGET set; the platform revokes any key in the manager's declared SKU universe
// that is absent from it — so the declared set (§8.2 inv 3) bounds both grant and
// revoke, and the handler needs no console-side policy.
export const SET_ENTITLEMENTS_KIND = "set-entitlements";
export const setEntitlementsPayload = z.object({
  tenantId: z.string().min(1),
  // The tenant's auth scope — the platform re-projects the entitlement set into
  // it (#310 is a full replace: DELETE-then-INSERT), so downgrades revoke cleanly.
  authScopeId: z.string().min(1),
  plan: z.string().min(1),
  entitlements: z.array(
    z.object({ key: z.string().min(1), plan: z.string().nullable() }),
  ),
});
export type SetEntitlementsPayload = z.infer<typeof setEntitlementsPayload>;
