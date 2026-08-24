// Provider value stamped on NEW username/password user rows. Legacy rows
// (and some tenants' connection.strategy fields) still carry "auth2" —
// reads must keep matching both via isUsernamePasswordProvider(); new
// users must NEVER be created with "auth2".
export const USERNAME_PASSWORD_PROVIDER = "auth0";

// Certificate lifetimes, in days. A JWT signing key is re-read from JWKS on
// every rotation, so a one-year certificate costs nothing. A SAML certificate
// is pinned by the service provider out-of-band and only changes when a human
// emails it over — give it years, or the renewal turns into an outage.
export const JWT_CERT_VALIDITY_DAYS = 365;
export const SAML_CERT_VALIDITY_DAYS = 5 * 365;

export const JWKS_CACHE_TIMEOUT_IN_SECONDS = 60 * 5; // 5 minutes
export const SILENT_AUTH_MAX_AGE_IN_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS = 24 * 60 * 60; // 1 day
export const SILENT_COOKIE_NAME = "auth-token";
// "Last used" connection hint (opt-in via promptSettings.show_last_used_connection).
// Value is the connection name only — never PII, never a fingerprint.
export const LAST_USED_CONNECTION_COOKIE_NAME = "last-used-connection";
export const LAST_USED_CONNECTION_MAX_AGE_IN_SECONDS = 365 * 24 * 60 * 60; // 1 year
export const OTP_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes
export const EMAIL_VERIFICATION_EXPIRATION_TIME = 7 * 24 * 60 * 60 * 1000; // One week
export const AUTHORIZATION_CODE_EXPIRES_IN_SECONDS = 5 * 60; // 5 minutes
export const OAUTH2_CODE_EXPIRES_IN_SECONDS = 5 * 60; // 5 minutes
export const TICKET_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes
export const PASSWORD_RESET_EXPIRATION_TIME = 30 * 60 * 1000; // 30 minutes
export const LOGIN_SESSION_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours

// "Try Connection" — internal per-tenant client used to drive a connection
// test in isolation from any real application. Globally unique because
// `clients.getByClientId` resolves client ids across tenants.
export const TRY_CONNECTION_CLIENT_ID_PREFIX = "authhero-try-connection-";
export function getTryConnectionClientId(tenantId: string): string {
  return `${TRY_CONNECTION_CLIENT_ID_PREFIX}${tenantId}`;
}
export function isTryConnectionClientId(clientId: string): boolean {
  return clientId.startsWith(TRY_CONNECTION_CLIENT_ID_PREFIX);
}
