export const Strategy = {
  EMAIL: "email",
  SMS: "sms",
  USERNAME_PASSWORD: "Username-Password-Authentication",
  GOOGLE_OAUTH2: "google-oauth2",
  APPLE: "apple",
  FACEBOOK: "facebook",
  GITHUB: "github",
  WINDOWSLIVE: "windowslive",
  VIPPS: "vipps",
  OIDC: "oidc",
  OAUTH2: "oauth2",
  SAMLP: "samlp",
  WAAD: "waad",
  ADFS: "adfs",
  OKTA: "okta",
} as const;

export const StrategyType = {
  DATABASE: "database",
  SOCIAL: "social",
  PASSWORDLESS: "passwordless",
} as const;

/**
 * The strategy value Auth0 stores on database connections. The canonical
 * target for new connection rows; see isDatabaseConnectionStrategy for
 * the legacy spellings still present in existing data.
 */
export const DATABASE_CONNECTION_STRATEGY = "auth0";

/**
 * True when a connection's `strategy` field marks it as a native database
 * (username/password) connection.
 *
 * Auth0 stores database connections with `strategy: "auth0"`. Existing
 * AuthHero data also contains two legacy spellings: the connection NAME
 * ("Username-Password-Authentication") reused as the strategy, and the
 * legacy provider literal ("auth2"). All readers must accept all three
 * until connection rows are backfilled to "auth0".
 */
export function isDatabaseConnectionStrategy(
  strategy: string | undefined | null,
): boolean {
  return (
    strategy === DATABASE_CONNECTION_STRATEGY ||
    strategy === Strategy.USERNAME_PASSWORD ||
    strategy === "auth2"
  );
}
