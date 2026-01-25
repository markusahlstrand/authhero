import { OpenAPIHono } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { validateJwtToken } from "../utils/jwt";

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
 * @param app
 */
export function createAuthMiddleware(
  app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>,
) {
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

      const authHeader = ctx.req.header("authorization") || "";
      const [authType, bearer] = authHeader.split(" ");
      if (authType?.toLowerCase() !== "bearer" || !bearer) {
        throw new JSONHTTPException(401, {
          message: "Missing bearer token",
        });
      }

      try {
        const tokenPayload = await validateJwtToken(ctx, bearer);
        ctx.set("user_id", tokenPayload.sub);
        ctx.set("user", tokenPayload);

        // Set org context from token claims (for downstream use by multi-tenancy package)
        if (tokenPayload.org_name) {
          ctx.set("org_name", tokenPayload.org_name);
        }
        if (tokenPayload.org_id) {
          ctx.set("organization_id", tokenPayload.org_id);
        }

        // Set tenant_id from token claim if not already set by tenant middleware
        if (!ctx.var.tenant_id && tokenPayload.tenant_id) {
          ctx.set("tenant_id", tokenPayload.tenant_id);
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

        if (
          requiredPermissions.length &&
          !(
            // Should we check both?
            (
              requiredPermissions.some((scope) =>
                permissions.includes(scope),
              ) || requiredPermissions.some((scope) => scopes.includes(scope))
            )
          )
        ) {
          throw new JSONHTTPException(403, { message: "Unauthorized" });
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
