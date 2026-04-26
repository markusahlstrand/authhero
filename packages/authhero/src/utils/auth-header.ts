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
