// Harness-only identifiers (not module code). Every kernel id is a ULID, so these
// are minted with ulid() once at load and stay fixed for the life of the process
// (seed, server and test all share one import). Readable names map to principals so
// the `x-principal` dev header can stay human ("operator", not a 26-char ULID).
import { ulid } from "@substrat-run/kernel";
import {
  platformActorId,
  principalId,
  scopeId,
  tenantId,
  type PlatformActorId,
  type PrincipalId,
  type ScopeId,
  type TenantId,
} from "@substrat-run/contracts";

// The platform "tenant" that owns the console scope. This is NOT a customer — it is
// where staff operate. (In the kernel-backed target this dissolves further into the
// host.admin control-plane layer; here it is a real tenant holding one scope.)
export const PLATFORM_TENANT: TenantId = tenantId.parse(ulid());
export const CONSOLE_SCOPE: ScopeId = scopeId.parse(ulid());

// Staff act with platform authority. Locally this is a dev stub; real SSO/MFA gates
// EXPOSING this, not building it.
export const PLATFORM_ACTOR: PlatformActorId = platformActorId.parse(ulid());

const mkPrincipal = (): PrincipalId => principalId.parse(ulid());

// The cast, by readable name. The auth core runs as its own service principal.
export const OPERATOR = mkPrincipal();
export const SUPPORT = mkPrincipal();
export const MALLORY = mkPrincipal();
export const AUTHCORE_SERVICE = mkPrincipal();

export const principalByName = new Map<string, PrincipalId>([
  ["operator", OPERATOR],
  ["support", SUPPORT],
  ["mallory", MALLORY],
  ["auth-core", AUTHCORE_SERVICE],
]);

export const CONSOLE_ENTITLEMENT = "authhero-console";
