// The console's declared permission surface (D-39/D-41) — what `substrat push`
// derives the permission registry + digest from, and what the platform's
// permission checkpoint diffs on promote. Reflects the DEPLOYED worker: the
// controlplane module and the roles provisioning stamps into the console scope.
import { definePermissions } from "@substrat-run/contracts";
import { controlplaneManifest } from "./manifest.js";
import { ROLES } from "./roles.js";

export const permissions = definePermissions({
  modules: [{ manifest: controlplaneManifest }],
  roles: ROLES,
});
