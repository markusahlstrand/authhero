import { isDatabaseConnectionStrategy } from "@authhero/adapter-interfaces";
import type { EnrichedClient } from "./client";

/**
 * Resolve the tenant's database (username/password) connection for a client.
 *
 * The reset-password flows need the real connection name/id because a user's
 * stored `user.connection` may be the hardcoded "Username-Password-Authentication"
 * fallback rather than the tenant's actual connection. Centralised here so the
 * HTML route and the screen handler resolve it identically.
 *
 * @param fallbackConnection connection name to use when the client has no
 *   database connection (typically `user.connection`).
 */
export function resolvePasswordConnection(
  client: EnrichedClient,
  fallbackConnection: string,
): { connection: string; connectionId?: string } {
  const passwordConnection = client.connections.find((c) =>
    isDatabaseConnectionStrategy(c.strategy),
  );
  return {
    connection: passwordConnection?.name || fallbackConnection,
    connectionId: passwordConnection?.id,
  };
}
