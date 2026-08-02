// The console's own domain policy (Tier 3 — "yours"): how a plan maps to the set
// of kernel entitlements a tenant holds, and how an auth-core feature name maps to
// the entitlement that gates it. This is pure data — no sql, no network, no node:* —
// so it is safe to share between module code (module.ts) and the harness (seed.ts).
//
// Entitlement keys are dash-only (kernel pattern /^[a-z0-9-]+$/), so a dotted
// namespace like `authhero.mfa` becomes `authhero-mfa`.
import { z } from "@substrat-run/contracts";

export const planSchema = z.enum(["free", "pro", "enterprise"]);
export type Plan = z.infer<typeof planSchema>;
export const PLANS = planSchema.options;

// The base entitlement every provisioned auth-core scope holds, plus the vertical
// name the auth core deploys under. `authhero-auth-core` is the module's
// entitlementKey — without it, none of the auth core's operations resolve.
export const AUTHCORE_ENTITLEMENT = "authhero-auth-core";
export const AUTHCORE_VERTICAL = "authhero-auth-core";

// The paid features, each behind its own entitlement key. A plan is a set of these.
export const FEATURE_ENTITLEMENT: Record<string, string> = {
  mfa: "authhero-mfa",
  "custom-domains": "authhero-custom-domains",
  saml: "authhero-saml",
};

// Every plan-grantable entitlement — the universe the plan-change reconciler
// revokes from when a downgrade drops a feature.
export const ALL_FEATURE_ENTITLEMENTS = Object.values(FEATURE_ENTITLEMENT);

// plan → the entitlements it grants. `free` is the base auth core with no paid
// features; each higher tier adds capabilities the auth core will read at its
// enforcement points via ctx.entitlement().
export const PLAN_ENTITLEMENTS: Record<Plan, string[]> = {
  free: [],
  pro: ["authhero-mfa", "authhero-custom-domains"],
  enterprise: ["authhero-mfa", "authhero-custom-domains", "authhero-saml"],
};
