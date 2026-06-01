import { OpenAPIHono } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { validateJwtToken } from "../utils/jwt";
import { extractBearerToken } from "../utils/auth-header";

/**
 * Management API audience for cross-tenant operations.
 * Used when managing tenants from the main tenant with org-scoped tokens.
 */
export const MANAGEMENT_API_AUDIENCE = "urn:authhero:management";

function convertRouteSyntax(route: string) {
  return route.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
}

/**
 * This registeres the authentication middleware. As it needs to read the OpenAPI definition, it needs to have a reference to the app.
 *
 * `requireManagementAudience` enables the defense-in-depth check that the
 * token's `aud` includes the management API audience. It must be enabled
 * for the management API and left off for everything else (the `/userinfo`
 * endpoint, for example, takes any access token issued by this tenant).
 *
 * `relaxManagementAudience` downgrades that audience check from a hard
 * rejection to a `console.warn`, letting tokens issued for other audiences
 * still pass. TRANSITIONAL: use only while migrating clients to request
 * the management audience; flip back off once warnings stop appearing.
 *
 * `additionalManagementAudiences` extends the set of accepted audiences
 * beyond the built-in `urn:authhero:management`. The resolver receives the
 * token's `tenant_id` and returns the list of audiences accepted for that
 * token, so a per-tenant identifier (e.g.
 * `https://${tenant_id}.token.example.com/v2/api/`) can be constructed at
 * request time alongside any global legacy identifiers.
 */
export type ManagementAudienceResolver = (params: {
  tenant_id?: string;
}) => string[] | Promise<string[]>;

export interface AuthMiddlewareOptions {
  requireManagementAudience?: boolean;
  relaxManagementAudience?: boolean;
  additionalManagementAudiences?: ManagementAudienceResolver;
}

// For a scope of the form `verb:resource` (e.g. `read:users`) also accept the
// reversed `resource:verb` form (`users:read`). Auth0 uses the former; some
// clients in the wild use the latter, so we treat them as equivalent rather
// than forcing every caller to reissue tokens.
function scopeForms(scope: string): string[] {
  const parts = scope.split(":");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return [scope];
  }
  const reversed = `${parts[1]}:${parts[0]}`;
  return reversed === scope ? [scope] : [scope, reversed];
}

export function createAuthMiddleware(
  app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>,
  options: AuthMiddlewareOptions = {},
) {
  const requireManagementAudience = options.requireManagementAudience ?? false;
  const relaxManagementAudience = options.relaxManagementAudience ?? false;
  const additionalManagementAudiences = options.additionalManagementAudiences;
  return async (
    ctx: Context<{ Bindings: Bindings; Variables }>,
    next: Next,
  ) => {
    const matchedRoute = ctx.req.matchedRoutes.find(
      (route) =>
        route.method.toUpperCase() === ctx.req.method && route.path !== "/*",
    );

    if (!matchedRoute) {
      return await next();
    }

    // Since the OpenAPI registry stores routes with their full paths (including basePaths),
    // we can directly use the matched route path to find the definition
    const matchedPath = convertRouteSyntax(matchedRoute.path);

    // Extract the path relative to /api/v2 for matching against OpenAPI definitions
    // The registry stores paths without the /api/v2 prefix
    const apiPrefix = "/api/v2";
    const relativePath = matchedPath.startsWith(apiPrefix)
      ? matchedPath.slice(apiPrefix.length) || "/"
      : matchedPath;

    const definition = app.openAPIRegistry.definitions.find(
      (def) =>
        "route" in def &&
        def.route.path === relativePath &&
        def.route.method.toUpperCase() === ctx.req.method.toUpperCase(),
    );

    if (definition && "route" in definition) {
      const requiredPermissions = definition.route.security?.[0]?.Bearer;

      // Bail if Bearer is not defined in security (undefined means no auth required)
      // Note: Bearer: [] means "authentication required but no specific scopes"
      if (requiredPermissions === undefined) {
        return await next();
      }

      const bearer = extractBearerToken(ctx.req.header("authorization"));
      if (!bearer) {
        throw new JSONHTTPException(401, {
          message: "Missing bearer token",
        });
      }

      try {
        const tokenPayload = await validateJwtToken(ctx, bearer);

        // Populate principal context from the validated token before any
        // authorization checks below. The token is cryptographically valid by
        // this point; the checks that follow gate access, not authenticity.
        // Setting these here lets audit logs attribute failed authorizations
        // (Invalid audience, cross-tenant denial, missing scope) to the actual
        // calling principal instead of recording an anonymous failure.
        ctx.set("user_id", tokenPayload.sub);
        ctx.set("user", tokenPayload);
        if (tokenPayload.azp) {
          ctx.set("client_id", tokenPayload.azp);
        }
        if (tokenPayload.org_name) {
          ctx.set("org_name", tokenPayload.org_name);
        }
        if (tokenPayload.org_id) {
          ctx.set("organization_id", tokenPayload.org_id);
        }
        if (!ctx.var.tenant_id && tokenPayload.tenant_id) {
          ctx.set("tenant_id", tokenPayload.tenant_id);
        }

        if (requireManagementAudience) {
          // Defense in depth: require the token's audience to be the
          // management API resource server. Without this check a token issued
          // for any other audience — including one minted with attacker-chosen
          // scopes via an unregistered audience — would be accepted as long as
          // it carried a matching scope/permission string.
          const aud = tokenPayload.aud;
          const tokenAudiences = Array.isArray(aud) ? aud : aud ? [aud] : [];
          const tokenTenantIdForAud =
            typeof tokenPayload.tenant_id === "string"
              ? tokenPayload.tenant_id
              : undefined;
          const extraAudiences = additionalManagementAudiences
            ? await additionalManagementAudiences({
                tenant_id: tokenTenantIdForAud,
              })
            : [];
          const acceptedAudiences = new Set<string>([
            MANAGEMENT_API_AUDIENCE,
            ...extraAudiences,
          ]);
          if (!tokenAudiences.some((a) => acceptedAudiences.has(a))) {
            if (relaxManagementAudience) {
              // TRANSITIONAL: client hasn't been updated to request the
              // management audience yet. Log so operators can identify the
              // remaining offenders and eventually flip the flag back off.
              console.warn(
                `[authhero] management API accepted token without management audience (relaxManagementAudience=true): sub=${tokenPayload.sub ?? "unknown"} aud=${JSON.stringify(aud)}`,
              );
            } else {
              throw new JSONHTTPException(403, {
                message: "Invalid audience",
              });
            }
          }

          // Cross-tenant guard: the management API resolves `tenant_id` from
          // the `tenant-id` request header (tenantMiddleware runs first). If
          // an authenticated token belongs to tenant A and the request targets
          // tenant B, only tokens issued by the deployment's control-plane
          // tenant may make that hop. Without this check, any admin token from
          // any tenant could be used to operate on any other tenant by
          // setting the `tenant-id` header.
          const tokenTenantId =
            typeof tokenPayload.tenant_id === "string"
              ? tokenPayload.tenant_id
              : undefined;
          const requestTenantId = ctx.var.tenant_id;
          if (
            tokenTenantId &&
            requestTenantId &&
            tokenTenantId !== requestTenantId
          ) {
            const cpId = ctx.env.data?.multiTenancyConfig?.controlPlaneTenantId;
            // Multi-tenant deployments must configure a control plane.
            // Single-tenant deployments shouldn't see this branch in practice
            // (there's only one tenant) — fail closed if we land here without
            // a configured control plane.
            if (!cpId || tokenTenantId !== cpId) {
              throw new JSONHTTPException(403, {
                message:
                  "Cross-tenant management requires a control-plane token",
              });
            }
          }
        }

        const permissions = Array.isArray(tokenPayload.permissions)
          ? tokenPayload.permissions
          : [];
        const scopes =
          typeof tokenPayload.scope === "string"
            ? tokenPayload.scope.split(" ")
            : Array.isArray(tokenPayload.scope)
              ? tokenPayload.scope
              : [];

        if (requiredPermissions.length) {
          const acceptedForms = requiredPermissions.flatMap(scopeForms);
          const hasMatch =
            acceptedForms.some((scope) => permissions.includes(scope)) ||
            acceptedForms.some((scope) => scopes.includes(scope));
          if (!hasMatch) {
            throw new JSONHTTPException(403, { message: "Unauthorized" });
          }
        }
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        throw new JSONHTTPException(403, { message: "Invalid token" });
      }
    }

    // If we can't find a matching route or definition we pass on the request
    return await next();
  };
}
