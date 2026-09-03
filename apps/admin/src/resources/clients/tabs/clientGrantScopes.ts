export interface ResourceServerLike {
  identifier: string;
  scopes?: Array<{
    value?: string;
    permission_name?: string;
    description?: string;
  }>;
}

export interface ScopeOption {
  value: string;
  description: string;
  /**
   * The grant carries this scope but the resource server does not define it.
   * `calculateClientCredentialsScopes` filters granted scopes against the
   * resource server's defined scopes, so these never reach an issued token.
   */
  undefinedOnResourceServer: boolean;
}

export const UNDEFINED_SCOPE_HINT =
  "Not defined on the resource server — dropped from issued tokens";

/** The scope values a resource server defines, normalised to a lookup set. */
export function definedScopeValues(server?: ResourceServerLike): Set<string> {
  return new Set(
    (server?.scopes ?? [])
      .map((s) => s.value ?? s.permission_name ?? "")
      .filter(Boolean),
  );
}

/** `audience -> defined scope values`, for flagging rows without opening a dialog. */
export function definedScopesByAudience(
  servers: ResourceServerLike[],
): Map<string, Set<string>> {
  return new Map(
    servers.map((server) => [server.identifier, definedScopeValues(server)]),
  );
}

/**
 * The checkbox list for a grant: every scope the resource server defines, plus
 * any scope the grant carries that it doesn't — the latter flagged so the UI
 * can show that it is silently dropped from issued tokens (#1359).
 */
export function buildScopeOptions(
  server: ResourceServerLike | undefined,
  grantScopes: string[] = [],
): ScopeOption[] {
  const options: ScopeOption[] = (server?.scopes ?? [])
    .map((s) => ({
      value: s.value ?? s.permission_name ?? "",
      description: s.description ?? "",
      undefinedOnResourceServer: false,
    }))
    .filter((s) => s.value);

  const defined = new Set(options.map((s) => s.value));
  for (const value of grantScopes) {
    if (value && !defined.has(value)) {
      options.push({
        value,
        description: "",
        undefinedOnResourceServer: true,
      });
      defined.add(value);
    }
  }

  return options;
}

/** The grant's scopes that the resource server does not define. */
export function undefinedGrantScopes(
  grantScopes: string[] = [],
  defined?: Set<string>,
): string[] {
  // No resource server loaded yet (or none matching the audience) — flag
  // nothing rather than flagging everything.
  if (!defined) return [];
  return grantScopes.filter((scope) => scope && !defined.has(scope));
}
