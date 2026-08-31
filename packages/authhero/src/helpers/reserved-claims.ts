import { Context } from "hono";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { logMessage } from "./logging";

/**
 * Claim names the authorization server owns.
 *
 * Every write path that lets tenant-supplied code (hooks, `customClaims`
 * parameters) add claims to a token or to the /userinfo response funnels
 * through `applyCustomClaim` / `applyCustomClaims` below, so a single list
 * governs all of them. Before this module each write path carried its own
 * list — the credentials-exchange hook API protected only the seven JWT-spec
 * names, /userinfo protected nothing at all, and service tokens protected a
 * third set — which meant a hook could rewrite claims the grant had computed
 * (`scope`, `permissions`, `tenant_id`, …) on some paths but not others.
 *
 * Colliding writes are dropped and logged rather than rejected: a hook that
 * picks an unlucky claim name degrades to "the claim isn't there", which is
 * visible in the tenant's log stream, instead of failing the whole login.
 */

/** RFC 7519 §4.1 registered claims. Reserved on every payload. */
const JWT_REGISTERED_CLAIMS = [
  "iss",
  "sub",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
] as const;

/**
 * Claims AuthHero itself stamps onto an access token.
 *
 * Keep in sync with the payload construction in
 * `authentication-flows/common.ts` and `helpers/service-token.ts` — both build
 * their server-owned claims as an object literal typed by
 * `ServerOwnedAccessTokenClaims`, so adding a claim there without adding its
 * name here is a compile error rather than a silently unprotected claim.
 *
 * Notes on individual entries:
 * - `tenant_id` is read back by `middlewares/authentication.ts` to populate the
 *   request's tenant context and to enforce the cross-tenant guard, so a
 *   caller-supplied value would satisfy that guard rather than trip it.
 * - `act` records the RFC 8693 acting party (impersonator or delegating
 *   client) for the audit trail; only the grant flow may set it, so a caller
 *   cannot forge the actor an impersonation is attributed to. `createAuthTokens`
 *   used to filter `act` out of its `customClaims` parameter specifically for
 *   this reason; reserving it here covers the hook `setCustomClaim` paths the
 *   bespoke filter never reached.
 * - `scope` and `permissions` are the authorization the grant actually
 *   computed, `org_id`/`org_name` the organization it resolved.
 * - `requested_userinfo_claims` is how the mint hands the OIDC Core 5.5
 *   `claims.userinfo` request through to /userinfo.
 */
const AUTHHERO_ACCESS_TOKEN_CLAIMS = [
  "client_id",
  "azp",
  "scope",
  "auth_time",
  "acr",
  "amr",
  "act",
  "sid",
  "permissions",
  "tenant_id",
  "org_id",
  "org_name",
  "requested_userinfo_claims",
  "gty",
] as const;

/**
 * Claims AuthHero stamps onto an ID token on top of the access-token set.
 *
 * `nonce` is set before the credentials-exchange hooks run, so without this it
 * is overwritable and RP replay protection breaks. `at_hash` / `c_hash` /
 * `s_hash` happen to be computed after the hooks today, so they are safe by
 * ordering alone — reserving them means the guarantee no longer depends on
 * where in `createAuthTokens` the hooks are invoked.
 */
const AUTHHERO_ID_TOKEN_CLAIMS = [
  "nonce",
  "at_hash",
  "c_hash",
  "s_hash",
] as const;

/** RFC 9068 §2.2 + AuthHero-owned access-token claims. */
export const ACCESS_TOKEN_RESERVED_CLAIMS = [
  ...JWT_REGISTERED_CLAIMS,
  ...AUTHHERO_ACCESS_TOKEN_CLAIMS,
] as const;

/** OIDC Core ID-token claims: the access-token set plus the ID-token-only ones. */
export const ID_TOKEN_RESERVED_CLAIMS = [
  ...ACCESS_TOKEN_RESERVED_CLAIMS,
  ...AUTHHERO_ID_TOKEN_CLAIMS,
] as const;

/**
 * /userinfo response. The identity set only — the response body is otherwise
 * made up of user profile claims, which hooks are expected to extend.
 */
export const USERINFO_RESERVED_CLAIMS = [...JWT_REGISTERED_CLAIMS] as const;

/**
 * Internal `auth-service` mints. Same set as an access token except `azp`:
 * trusted internal hook code overrides it to attribute the call to a
 * vendor/tenant for downstream APIs while `sub` stays `auth-service`.
 * Client-bound mints keep `azp` locked (see below).
 */
export const SERVICE_TOKEN_RESERVED_CLAIMS =
  ACCESS_TOKEN_RESERVED_CLAIMS.filter((claim) => claim !== "azp");

/** Client-bound mints: `azp` must stay the registered client id. */
export const CLIENT_SERVICE_TOKEN_RESERVED_CLAIMS = [
  ...ACCESS_TOKEN_RESERVED_CLAIMS,
];

export type AccessTokenReservedClaim =
  (typeof ACCESS_TOKEN_RESERVED_CLAIMS)[number];
export type IdTokenReservedClaim = (typeof ID_TOKEN_RESERVED_CLAIMS)[number];

/**
 * The server-owned half of an access-token payload. Typing the payload literal
 * as this makes TypeScript's excess-property check reject any claim name that
 * isn't in `ACCESS_TOKEN_RESERVED_CLAIMS`, so a new server-owned claim cannot
 * be added to the mint without also being reserved.
 */
export type ServerOwnedAccessTokenClaims = Partial<
  Record<AccessTokenReservedClaim, unknown>
>;

/** As `ServerOwnedAccessTokenClaims`, for the ID token. */
export type ServerOwnedIdTokenClaims = Partial<
  Record<IdTokenReservedClaim, unknown>
>;

/** Which payload a custom claim is being written to. */
export type ClaimPayloadKind =
  | "access_token"
  | "id_token"
  | "userinfo"
  | "service_token"
  | "client_service_token";

const RESERVED_BY_KIND: Record<ClaimPayloadKind, readonly string[]> = {
  access_token: ACCESS_TOKEN_RESERVED_CLAIMS,
  id_token: ID_TOKEN_RESERVED_CLAIMS,
  userinfo: USERINFO_RESERVED_CLAIMS,
  service_token: SERVICE_TOKEN_RESERVED_CLAIMS,
  client_service_token: CLIENT_SERVICE_TOKEN_RESERVED_CLAIMS,
};

export function isReservedClaim(
  claim: string,
  kind: ClaimPayloadKind,
): boolean {
  return RESERVED_BY_KIND[kind].includes(claim);
}

export interface ApplyCustomClaimOptions {
  /** Which payload is being written to — selects the reserved set. */
  kind: ClaimPayloadKind;
  /**
   * Who is writing. Used in the warning so an operator can tell which hook
   * dropped a claim (e.g. `onExecuteCredentialsExchange`,
   * `template-hook:add-roles`, `createServiceToken`).
   */
  source: string;
  /** Request context, when there is one — the warning goes to the tenant log. */
  ctx?: Context<{ Bindings: Bindings; Variables: Variables }>;
  /** Tenant to log against. Defaults to `ctx.var.tenant_id`. */
  tenantId?: string;
}

/**
 * Write a caller-supplied claim onto a payload unless the authorization server
 * owns that claim name.
 *
 * @returns true when the claim was written, false when it was dropped.
 */
export function applyCustomClaim(
  payload: Record<string, unknown>,
  claim: string,
  value: unknown,
  options: ApplyCustomClaimOptions,
): boolean {
  if (isReservedClaim(claim, options.kind)) {
    warnDroppedClaim(claim, options);
    return false;
  }
  payload[claim] = value;
  return true;
}

/**
 * Bulk variant of `applyCustomClaim`. Returns a new object holding only the
 * claims that are safe to merge, so callers can keep spreading them into a
 * payload literal.
 */
export function applyCustomClaims(
  claims: Record<string, unknown> | undefined,
  options: ApplyCustomClaimOptions,
): Record<string, unknown> | undefined {
  if (!claims) return undefined;
  const accepted: Record<string, unknown> = {};
  for (const [claim, value] of Object.entries(claims)) {
    applyCustomClaim(accepted, claim, value, options);
  }
  return accepted;
}

function warnDroppedClaim(claim: string, options: ApplyCustomClaimOptions) {
  const description = `Dropped custom claim '${claim}' from ${options.kind}: the claim name is reserved by the authorization server (set by ${options.source})`;

  const ctx = options.ctx;
  const tenantId = options.tenantId ?? ctx?.var.tenant_id;
  if (ctx && tenantId) {
    // Fire-and-forget: the mint continues without the claim, and the outbox
    // middleware's finally block flushes queued events.
    logMessage(ctx, tenantId, {
      type: LogTypes.WARNING_DURING_LOGIN,
      description,
    }).catch(() => {});
    return;
  }

  console.warn(`[reserved-claims] ${description}`);
}
