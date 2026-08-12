// The auth-core vertical's kernel-module definition — pure contracts data, no
// runtime imports, so BOTH the worker (defineScopeDO/operations) and the
// permission surface (src/permissions.ts, imported by `substrat push` in node)
// can consume it without dragging Cloudflare types through a node import.
import {
  moduleManifest,
  permissionKey,
  type RoleDefinition,
} from "@substrat-run/contracts";

export const FEATURE_ENTITLEMENT: Record<string, string> = {
  mfa: "authhero-mfa",
  "custom-domains": "authhero-custom-domains",
  saml: "authhero-saml",
};

export const PERM_FEATURE_CHECK = permissionKey.parse("authcore:feature-check");

export const authcoreManifest = moduleManifest.parse({
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

export const ROLES: RoleDefinition[] = [
  { key: "auth-admin", permissions: [PERM_FEATURE_CHECK], source: "vertical" },
];

export const OWNER_ROLE = "auth-admin";
