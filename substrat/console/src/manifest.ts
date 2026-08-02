// Module manifests + the PERM constants they declare. Two modules live on this
// host (see the design doc, "Two databases per tenant, never one"):
//
//  - `controlplane` runs in the platform's console scope. It owns the tenant
//    registry and emits the fat events that drive provisioning and plan changes.
//  - `authcore` is the stand-in for the WFP-hosted AuthHero auth core. It runs in
//    each customer's own scope and does exactly one thing here: read the tenant's
//    entitlement set at an enforcement point (the §5.4 read-port). In production
//    this is the real OAuth/OIDC runtime; locally it is one probe operation so the
//    entitlements seam can be exercised end to end.
import {
  moduleManifest,
  permissionKey,
  type PermissionKey,
} from "@substrat-run/contracts";

const perm = (key: string): PermissionKey => permissionKey.parse(key);

export const CP_PERM = {
  provision: perm("console:tenant-provision"),
  read: perm("console:tenant-read"),
  planManage: perm("console:plan-manage"),
} as const;

export const AUTHCORE_PERM = {
  featureCheck: perm("authcore:feature-check"),
} as const;

export const controlplaneManifest = moduleManifest.parse({
  id: "controlplane",
  version: "0.0.0",
  kernelContract: "^0.0.1",
  permissions: [
    {
      key: CP_PERM.provision,
      description:
        "Register a customer tenant and provision its auth-core scope + entitlements.",
    },
    { key: CP_PERM.read, description: "View the tenant registry." },
    {
      key: CP_PERM.planManage,
      description: "Change a tenant's plan (grants/revokes its entitlements).",
    },
  ],
  events: {
    emits: [
      { type: "console.tenant-registered", schemaVersion: 1 },
      { type: "console.plan-changed", schemaVersion: 1 },
    ],
    consumes: [],
  },
  migrations: { journalDir: "controlplane", compatibleFrom: "0.0.0" },
  attachmentTargets: [],
  entitlementKey: "authhero-console",
  // Deployment config, resolved by the worker (resolveEnvSpec) and served to the
  // SPA as window.__APP_CONFIG__. Admin login = AuthHero as OIDC issuer (design
  // §6): defaults point at the local docker image seeded like today
  // (SEED=true + ADMIN_USERNAME/ADMIN_PASSWORD → admin account + client).
  envSpec: [
    {
      key: "OIDC_ISSUER",
      label: "AuthHero issuer",
      description:
        "The AuthHero deployment console admins log in against — byte-exact as it appears in the `iss` claim (usually ends with '/').",
      placeholder: "https://auth.example.com/",
      default: "https://authhero-auth-core-authhero.global.substrat.run/",
      group: "Auth",
    },
    {
      key: "OIDC_CLIENT_ID",
      label: "Console client id",
      description:
        "The AuthHero client the SPA uses for PKCE login (the docker seed prints one; 'default' matches its fallback).",
      default: "default",
      group: "Auth",
    },
    {
      key: "OIDC_AUDIENCE",
      label: "API audience",
      description:
        "The audience bearer tokens must carry. urn:authhero:management matches the admin surface and always exists on seeded tenants.",
      default: "urn:authhero:management",
      required: false,
      group: "Auth",
    },
    {
      key: "OWNER_SUB",
      label: "Operator sub",
      description:
        "The AuthHero sub of the human operator; grants their login the platform-operator role at provision/configure.",
      default: "auth0|0aceaa2aa48fddc1729072ee",
      required: false,
      group: "Bootstrap",
    },
  ],
});

export const authcoreManifest = moduleManifest.parse({
  id: "authcore",
  version: "0.0.0",
  kernelContract: "^0.0.1",
  permissions: [
    {
      key: AUTHCORE_PERM.featureCheck,
      description:
        "Read the tenant's entitlement set at an enforcement point (the auth-core read-port).",
    },
  ],
  events: { emits: [], consumes: [] },
  migrations: { journalDir: "authcore", compatibleFrom: "0.0.0" },
  attachmentTargets: [],
  entitlementKey: "authhero-auth-core",
});
