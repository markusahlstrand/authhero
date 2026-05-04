/**
 * Parse an HTTP `Authorization` header and return the bearer token payload
 * if and only if the scheme is `Bearer` (case-insensitive).
 *
 * Returns `undefined` for missing header, wrong scheme, or empty token.
 */
export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader) return undefined;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return undefined;
  return token?.trim() || undefined;
}

/**
 * Parse an HTTP `Authorization: Basic` header into `{ client_id, client_secret }`
 * for OAuth 2.0 client_secret_basic authentication (RFC 6749 §2.3.1).
 *
 * Returns an empty object when the header is missing, uses a non-Basic scheme,
 * or fails to decode.
 */
export function parseBasicAuthHeader(authHeader?: string): {
  client_id?: string;
  client_secret?: string;
} {
  if (!authHeader) return {};
  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !token) return {};
  const [client_id, client_secret] = atob(token).split(":");
  return { client_id, client_secret };
}
