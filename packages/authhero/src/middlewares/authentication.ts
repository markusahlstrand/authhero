import { OpenAPIHono, z } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
import { JSONHTTPException } from "../errors/json-http-exception";
import { decode, verify } from "hono/jwt";
import { getJwksFromDatabase } from "../utils/jwks";

const JwksKeySchema = z.object({
  alg: z.literal("RS256"),
  kty: z.literal("RSA"),
  use: z.literal("sig"),
  n: z.string(),
  e: z.string(),
  kid: z.string(),
  x5t: z.string(),
  x5c: z.array(z.string()),
});
type JwksKey = z.infer<typeof JwksKeySchema>;

interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  scope: string;
  permissions?: string[];
  azp?: string;
  tenant_id?: string;
  org_id?: string;
  org_name?: string;
}

/**
 * Management API audience for cross-tenant operations.
 * Used when managing tenants from the main tenant with org-scoped tokens.
 */
export const MANAGEMENT_API_AUDIENCE = "urn:authhero:management";

/**
 * Generates the audience URN for a specific tenant.
 * @param tenantId - The tenant ID
 * @returns The audience URN in the format `urn:authhero:tenant:{tenantId}`
 */
export function getTenantAudience(tenantId: string): string {
  return `urn:authhero:tenant:${tenantId}`;
}

/**
 * Extracts the tenant ID from a tenant-specific audience URN.
 * @param audience - The audience URN
 * @returns The tenant ID if it's a tenant audience, null otherwise
 */
export function extractTenantIdFromAudience(audience: string): string | null {
  const prefix = "urn:authhero:tenant:";
  if (audience.startsWith(prefix)) {
    return audience.slice(prefix.length);
  }
  return null;
}

async function getJwks(bindings: Bindings) {
  if (bindings.JWKS_URL && bindings.JWKS_SERVICE) {
    const response = await bindings.JWKS_SERVICE.fetch(bindings.JWKS_URL);

    if (!response.ok) {
      // If remote JWKS fails, fall back to database
      console.warn(
        `JWKS fetch failed with status ${response.status}, falling back to database`,
      );
      return await getJwksFromDatabase(bindings.data);
    }

    const responseBody: { keys: JwksKey[] } = await response.json();

    return responseBody.keys;
  }

  return await getJwksFromDatabase(bindings.data);
}

async function validateJwtToken(
  ctx: Context,
  token: string,
): Promise<JwtPayload> {
  try {
    // First decode the JWT to get the header and find the right key
    const { header } = decode(token);

    const jwksKeys = await getJwks(ctx.env);
    const jwksKey = jwksKeys.find((key) => key.kid === header.kid);

    if (!jwksKey) {
      throw new JSONHTTPException(401, { message: "No matching kid found" });
    }

    // Convert JWKS key to CryptoKey for verification
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwksKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    // Verify the token using hono/jwt with the CryptoKey
    const verifiedPayload = await verify(token, cryptoKey, "RS256");

    return verifiedPayload as unknown as JwtPayload;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    throw new JSONHTTPException(403, { message: "Invalid JWT signature" });
  }
}

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
        // Can we just keep the user?
        ctx.set("user_id", tokenPayload.sub);
        ctx.set("user", tokenPayload);

        // Determine the tenant from token audience
        const audiences = Array.isArray(tokenPayload.aud)
          ? tokenPayload.aud
          : [tokenPayload.aud];

        // Check if this is a management token (urn:authhero:management)
        const isManagementToken = audiences.includes(MANAGEMENT_API_AUDIENCE);

        // Check if this is a tenant-specific token (urn:authhero:tenant:{id})
        const tenantAudience = audiences.find((aud) =>
          aud.startsWith("urn:authhero:tenant:"),
        );
        const audienceTenantId = tenantAudience
          ? extractTenantIdFromAudience(tenantAudience)
          : null;

        // Get the current tenant from context (set by tenant middleware)
        const currentTenantId = ctx.var.tenant_id;

        if (isManagementToken) {
          // Management tokens require org_id or org_name for non-tenant-list operations
          // The org_id/org_name specifies which tenant's resources to access
          const orgId = tokenPayload.org_id;
          const orgName = tokenPayload.org_name;

          // Set org_name and organization_id on context for downstream use (e.g., access control)
          if (orgName) {
            ctx.set("org_name", orgName);
          }
          if (orgId) {
            ctx.set("organization_id", orgId);
          }

          // For tenant list/create/settings endpoints, we don't require org_id
          // Note: /settings comes from tenantRoutes which is mounted at /tenants
          const isTenantManagementEndpoint =
            relativePath === "/tenants" ||
            relativePath.startsWith("/tenants/") ||
            relativePath === "/settings" ||
            relativePath.startsWith("/settings/");

          if (!isTenantManagementEndpoint) {
            // For other endpoints, org_id or org_name is required
            // org_name takes precedence when matching with tenant ID (for multi-tenancy)
            const orgIdentifier = orgName || orgId;
            if (!orgIdentifier) {
              throw new JSONHTTPException(403, {
                message:
                  "Management tokens require org_id or org_name claim for accessing tenant resources",
              });
            }

            // If tenant_id is not set by tenant middleware (no header, subdomain, or custom domain),
            // derive it from the token's org_name/org_id
            if (!currentTenantId) {
              ctx.set("tenant_id", orgIdentifier);
            } else if (orgIdentifier !== currentTenantId) {
              // If tenant_id was explicitly set, it must match the token's org
              throw new JSONHTTPException(403, {
                message: `Token organization '${orgIdentifier}' does not match tenant '${currentTenantId}'`,
              });
            }
          }
        } else if (audienceTenantId) {
          // Tenant-specific tokens can only access their own tenant's resources
          if (audienceTenantId !== currentTenantId) {
            throw new JSONHTTPException(403, {
              message: `Token audience is for tenant '${audienceTenantId}' but request is for tenant '${currentTenantId}'`,
            });
          }
          // Set tenant_id from audience if not already set
          if (!ctx.var.tenant_id) {
            ctx.set("tenant_id", audienceTenantId);
          }
        } else {
          // Legacy tokens without the new audience format
          // Fall back to setting tenant_id from token if present
          if (!ctx.var.tenant_id && tokenPayload.tenant_id) {
            ctx.set("tenant_id", tokenPayload.tenant_id);
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
