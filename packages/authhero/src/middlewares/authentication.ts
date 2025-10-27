import { OpenAPIHono, z } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";
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
  aud: string[];
  iat: number;
  exp: number;
  scope: string;
  permissions?: string[];
  azp?: string;
  tenant_id?: string;
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
      throw new HTTPException(401, { message: "No matching kid found" });
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
    throw new HTTPException(403, { message: "Invalid JWT signature" });
  }
}

function convertRouteSyntax(route: string) {
  return route.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
}

function getAbsoluteDefinitionPath(basePath: string, definitionPath: string) {
  if (definitionPath.startsWith(basePath)) {
    return definitionPath;
  }
  return basePath + definitionPath;
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

    const basePath =
      "basePath" in matchedRoute && typeof matchedRoute.basePath === "string"
        ? matchedRoute.basePath
        : "";

    const definition = app.openAPIRegistry.definitions.find(
      (def) =>
        "route" in def &&
        getAbsoluteDefinitionPath(basePath, def.route.path) === matchedPath &&
        def.route.method.toUpperCase() === ctx.req.method.toUpperCase(),
    );

    if (definition && "route" in definition) {
      const requiredPermissions = definition.route.security?.[0]?.Bearer;

      // Bail if not Bearer is defined
      if (!requiredPermissions?.length) {
        return await next();
      }

      const authHeader = ctx.req.header("authorization") || "";
      const [authType, bearer] = authHeader.split(" ");
      if (authType?.toLowerCase() !== "bearer" || !bearer) {
        throw new HTTPException(401, {
          message: "Missing bearer token",
        });
      }

      try {
        const tokenPayload = await validateJwtToken(ctx, bearer);
        // Can we just keep the user?
        ctx.set("user_id", tokenPayload.sub);
        ctx.set("user", tokenPayload);

        // Set tenant_id from token if not already set by tenant middleware
        // This is important for endpoints like /userinfo that don't have tenant context in the URL
        if (!ctx.var.tenant_id && tokenPayload.tenant_id) {
          ctx.set("tenant_id", tokenPayload.tenant_id);
        }

        const permissions = tokenPayload.permissions || [];
        const scopes = tokenPayload.scope?.split(" ") || [];

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
          throw new HTTPException(403, { message: "Unauthorized" });
        }
      } catch (error) {
        if (error instanceof HTTPException) {
          throw error;
        }
        throw new HTTPException(403, { message: "Invalid token" });
      }
    }

    // If we can't find a matching route or definition we pass on the request
    return await next();
  };
}
