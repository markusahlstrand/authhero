/**
 * Refresh-token lifetimes (issue #1260).
 *
 * Auth0 keeps refresh-token expiry and session expiry as two separate
 * concepts: the former is configured per *client* (`client.refresh_token.*`,
 * in seconds), the latter per *tenant* (`session_lifetime` /
 * `idle_session_lifetime`, in hours). AuthHero historically derived
 * refresh-token expiry from the tenant session lifetimes only, which made
 * `infinite_token_lifetime` — the setting native/mobile clients rely on —
 * unrepresentable.
 *
 * These helpers resolve the effective lifetime: per-client config wins when
 * set, otherwise we fall back to the tenant-derived behaviour so existing
 * tenants see no change.
 */

/**
 * A resolved refresh-token lifetime.
 *
 * - `seconds` — expires this many seconds after the anchor point.
 * - `infinite` — explicitly configured never to expire.
 * - `unset` — nothing configured at either level. Distinct from `infinite`
 *   so callers can tell "the operator asked for no expiry" from "no opinion":
 *   at mint both mean no expiry, but on rotation only `infinite` clears an
 *   expiry the parent row already carried.
 */
export type RefreshTokenLifetime =
  | { kind: "seconds"; seconds: number }
  | { kind: "infinite" }
  | { kind: "unset" };

/** The subset of a client this module reads. */
export interface RefreshTokenLifetimeClient {
  refresh_token?: {
    expiration_type?: "expiring" | "non-expiring";
    token_lifetime?: number;
    infinite_token_lifetime?: boolean;
    idle_token_lifetime?: number;
    infinite_idle_token_lifetime?: boolean;
  };
  tenant: {
    session_lifetime?: number;
    idle_session_lifetime?: number;
  };
}

const SECONDS_PER_HOUR = 60 * 60;

/**
 * Tenant lifetimes are in hours. A zero/negative/absent value has always meant
 * "no expiry" here (`lifetimeToIso` returned undefined for anything falsy), so
 * it maps to `unset` rather than an immediate expiry.
 */
function fromTenantHours(hours?: number): RefreshTokenLifetime {
  if (!hours || hours <= 0) return { kind: "unset" };
  return { kind: "seconds", seconds: hours * SECONDS_PER_HOUR };
}

/** Same treatment for the per-client seconds values. */
function fromClientSeconds(seconds?: number): RefreshTokenLifetime | undefined {
  if (seconds === undefined || seconds <= 0) return undefined;
  return { kind: "seconds", seconds };
}

/**
 * Absolute ("hard") refresh-token lifetime: how long the token is valid for,
 * regardless of use.
 */
export function resolveAbsoluteRefreshTokenLifetime(
  client: RefreshTokenLifetimeClient,
): RefreshTokenLifetime {
  const config = client.refresh_token;

  // `non-expiring` is Auth0's master switch — the token never expires, idle or
  // otherwise — so it outranks the individual lifetime values.
  if (config?.expiration_type === "non-expiring") return { kind: "infinite" };
  if (config?.infinite_token_lifetime) return { kind: "infinite" };

  return (
    fromClientSeconds(config?.token_lifetime) ??
    fromTenantHours(client.tenant.session_lifetime)
  );
}

/**
 * Idle ("sliding") refresh-token lifetime: how long the token survives without
 * being exchanged. Refreshed on every successful exchange.
 */
export function resolveIdleRefreshTokenLifetime(
  client: RefreshTokenLifetimeClient,
): RefreshTokenLifetime {
  const config = client.refresh_token;

  if (config?.expiration_type === "non-expiring") return { kind: "infinite" };
  if (config?.infinite_idle_token_lifetime) return { kind: "infinite" };

  return (
    fromClientSeconds(config?.idle_token_lifetime) ??
    fromTenantHours(client.tenant.idle_session_lifetime)
  );
}

/**
 * Turn a lifetime into an ISO expiry timestamp measured from `from`.
 * `infinite` and `unset` both yield `undefined` — no expiry column is written.
 */
export function lifetimeToExpiresAt(
  lifetime: RefreshTokenLifetime,
  from: number = Date.now(),
): string | undefined {
  if (lifetime.kind !== "seconds") return undefined;
  return new Date(from + lifetime.seconds * 1000).toISOString();
}

/**
 * Both expiry timestamps for a freshly minted refresh token.
 */
export function resolveRefreshTokenExpiry(
  client: RefreshTokenLifetimeClient,
  from: number = Date.now(),
): { expires_at?: string; idle_expires_at?: string } {
  return {
    expires_at: lifetimeToExpiresAt(
      resolveAbsoluteRefreshTokenLifetime(client),
      from,
    ),
    idle_expires_at: lifetimeToExpiresAt(
      resolveIdleRefreshTokenLifetime(client),
      from,
    ),
  };
}

/**
 * The idle expiry a token should carry after a successful exchange.
 *
 * Sliding only applies to a token that already had an idle window: a row minted
 * without one is not retro-fitted with an expiry mid-life. The exception is an
 * explicit `infinite` config, which clears an existing window so a client
 * switched to non-expiring stops being cut off by expiries stamped earlier.
 */
export function slideIdleExpiry(
  client: RefreshTokenLifetimeClient,
  currentIdleExpiresAt: string | undefined,
  from: number = Date.now(),
): string | undefined {
  const lifetime = resolveIdleRefreshTokenLifetime(client);
  if (lifetime.kind === "infinite") return undefined;
  if (lifetime.kind === "unset" || !currentIdleExpiresAt) {
    return currentIdleExpiresAt;
  }
  return lifetimeToExpiresAt(lifetime, from);
}
