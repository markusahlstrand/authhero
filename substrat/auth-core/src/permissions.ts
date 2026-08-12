// The auth-core vertical's declared permission surface (D-39/D-41). NOTE: this
// covers the KERNEL surface (the scope's probe module + the auth-admin role) —
// AuthHero's own Auth0-style RBAC lives inside each tenant's store and is the
// application's domain, not the platform permission checkpoint's.
import { definePermissions } from "@substrat-run/contracts";
import { authcoreManifest, ROLES } from "./module-def.js";

export const permissions = definePermissions({
  modules: [{ manifest: authcoreManifest }],
  roles: ROLES,
});
