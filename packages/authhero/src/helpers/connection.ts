import { Context } from "hono";
import { LoginSession, User } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { HookEvent } from "../types/Hooks";

export type ConnectionInfo = NonNullable<HookEvent["connection"]>;

export interface ConnectionNameSources {
  /** The login session's stored auth_connection — the exact connection captured
   *  at authentication time. Correct even for linked users. */
  loginSession?: Pick<LoginSession, "auth_connection"> | null;
  /** An explicitly resolved connection name passed down a flow. */
  authConnection?: string | null;
  /** The request-scoped ctx.var.connection (set during interactive flows). */
  ctxConnection?: string | null;
  /** The authenticated user. Pass ONLY where guessing from the user record is
   *  acceptable (read-time hook events) — omit when persisting the authoritative
   *  auth_connection, so a linked user's primary connection is never stored. */
  user?: Pick<User, "connection"> | null;
}

/**
 * Resolve the connection name used for authentication, in priority order:
 *  1. the login session's stored `auth_connection`
 *  2. an explicitly passed connection name
 *  3. the request-scoped `ctx.var.connection`
 *  4. the user's own `connection` (last resort — only when `user` is supplied)
 *
 * Supplying `user` is what populates `event.connection` on token-exchange and
 * refresh requests that carry no session connection, matching Auth0's contract
 * that the connection is available whenever it can be derived.
 */
export function resolveConnectionName(
  sources: ConnectionNameSources,
): string | undefined {
  return (
    sources.loginSession?.auth_connection ||
    sources.authConnection ||
    sources.ctxConnection ||
    sources.user?.connection ||
    undefined
  );
}

/**
 * Look up a connection by name and build the Auth0-compatible object exposed to
 * hooks (`event.connection`). Matches by exact name first, then case-insensitively.
 * Returns `undefined` when the name is empty or doesn't resolve to a known
 * connection — callers decide whether to synthesize a fallback.
 */
export async function getConnectionInfo(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  tenantId: string,
  connectionName: string | undefined,
  user?: Pick<User, "provider"> | null,
): Promise<ConnectionInfo | undefined> {
  if (!connectionName) {
    return undefined;
  }

  try {
    // No list params: the parameterless shape is what the client-bundle
    // caches (same shape getEnrichedClient uses for "all tenant
    // connections"), so this read is served from the bundle instead of a
    // per-request round-trip.
    const { connections } = await ctx.env.data.connections.list(tenantId);

    const connection =
      connections.find((c) => c.name === connectionName) ??
      connections.find(
        (c) => c.name.toLowerCase() === connectionName.toLowerCase(),
      );

    if (!connection) {
      return undefined;
    }

    return {
      id: connection.id || connection.name,
      name: connection.name,
      strategy: connection.strategy || user?.provider || "auth0",
      metadata: connection.options || {},
    };
  } catch (error) {
    console.error("Error fetching connection info:", error);
    return undefined;
  }
}
