// The console's role definitions — one list, used by BOTH harnesses: seed.ts
// defines them via host.admin (CP-full local dev) and worker.ts projects them at
// /internal/provision (CP-less hosted). Pure data.
import type { RoleDefinition } from "@substrat-run/contracts";
import { CP_PERM } from "./manifest.js";

export const ROLES: RoleDefinition[] = [
  {
    key: "platform-operator",
    permissions: [CP_PERM.provision, CP_PERM.read, CP_PERM.planManage],
    source: "vertical",
  },
  {
    key: "support-agent",
    permissions: [CP_PERM.read],
    source: "vertical",
  },
];

export const OWNER_ROLE = "platform-operator";
