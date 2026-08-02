// The harness: builds a host, registers the modules, and seeds a world. Exempt
// from the module-layer rules (this is host code).
//
// Provisioning follows the REAL platform-intents flow (platform-intents.md):
// the console module enqueues `provision-tenant` / `set-entitlements` intents via
// ctx.requestPlatform, and this harness drains them through control-plane-api's
// drain engine with the CP-full sqlite host playing the platform
// (src/platform-handlers.ts). Same code path as hosted; only the authority
// source differs.
import { SqliteScopeHost } from "@substrat-run/adapter-sqlite";
import { z } from "@substrat-run/contracts";
import type { ScopeHost } from "@substrat-run/kernel";
import { CP_PERM } from "./manifest.js";
import { authcoreModule, controlplaneModule } from "./module.js";
import { drainConsole, type LocalPlatformDeps } from "./platform-handlers.js";
import {
  AUTHCORE_SERVICE,
  CONSOLE_ENTITLEMENT,
  CONSOLE_SCOPE,
  MALLORY,
  OPERATOR,
  PLATFORM_ACTOR,
  PLATFORM_TENANT,
  SUPPORT,
} from "./constants.js";

const registerResult = z.object({
  tenantId: z.string(),
  authScopeId: z.string(),
  slug: z.string(),
  plan: z.string(),
});
export type SeededTenant = z.infer<typeof registerResult>;

export interface SeedResult {
  host: ScopeHost;
  deps: LocalPlatformDeps;
  tenants: SeededTenant[];
}

export async function seedWorld(dir: string): Promise<SeedResult> {
  const host = new SqliteScopeHost({ dir });

  host.registerModule(controlplaneModule);
  host.registerModule(authcoreModule);

  const deps: LocalPlatformDeps = {
    host,
    actor: PLATFORM_ACTOR,
    authcoreReader: AUTHCORE_SERVICE,
  };

  // --- the platform tenant + console scope (where staff operate) ---
  await host.admin.createTenant(PLATFORM_ACTOR, {
    id: PLATFORM_TENANT,
    slug: "platform",
    name: "AuthHero Platform",
  });
  await host.admin.grantEntitlement(
    PLATFORM_ACTOR,
    PLATFORM_TENANT,
    CONSOLE_ENTITLEMENT,
  );
  await host.provisionScope(PLATFORM_ACTOR, {
    tenantId: PLATFORM_TENANT,
    scopeId: CONSOLE_SCOPE,
    vertical: "authhero-console",
    jurisdiction: "eu",
    slug: "console",
    name: "Console",
  });
  await host.admin.activateScope(
    PLATFORM_ACTOR,
    PLATFORM_TENANT,
    CONSOLE_SCOPE,
  );

  // --- the cast: roles + assignments, per tenant ---
  await host.admin.defineRole(PLATFORM_ACTOR, PLATFORM_TENANT, {
    key: "platform-operator",
    permissions: [CP_PERM.provision, CP_PERM.read, CP_PERM.planManage],
    source: "vertical",
  });
  await host.admin.defineRole(PLATFORM_ACTOR, PLATFORM_TENANT, {
    key: "support-agent",
    permissions: [CP_PERM.read],
    source: "vertical",
  });

  const consoleNode = { tenantId: PLATFORM_TENANT, scopeId: CONSOLE_SCOPE };
  await host.admin.assignRole(PLATFORM_ACTOR, {
    principalId: OPERATOR,
    roleKey: "platform-operator",
    node: consoleNode,
  });
  await host.admin.assignRole(PLATFORM_ACTOR, {
    principalId: SUPPORT,
    roleKey: "support-agent",
    node: consoleNode,
  });
  // MALLORY is deliberately granted nothing — the attacker.
  void MALLORY;

  // --- seed two customer tenants THROUGH the real operation (never raw SQL),
  //     then drain their provision-tenant intents (the platform's role) ---
  const stub = await host.getScope(OPERATOR, PLATFORM_TENANT, CONSOLE_SCOPE);
  const acme = registerResult.parse(
    await stub.invoke("controlplane/register-tenant", {
      slug: "acme",
      name: "Acme Inc",
      plan: "pro",
    }),
  );
  const globex = registerResult.parse(
    await stub.invoke("controlplane/register-tenant", {
      slug: "globex",
      name: "Globex LLC",
      plan: "free",
    }),
  );
  await drainConsole(deps);

  return { host, deps, tenants: [acme, globex] };
}
