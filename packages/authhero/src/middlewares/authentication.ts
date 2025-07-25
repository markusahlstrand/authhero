import { OpenAPIHono, z } from "@hono/zod-openapi";
import { Context, Next } from "hono";
import { Bindings, Variables } from "../types";
import { HTTPException } from "hono/http-exception";

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

interface TokenData {
  header: {
    alg: string;
    typ: string;
    kid: string;
  };
  payload: {
    sub: string;
    iss: string;
    aud: string[];
    iat: number;
    exp: number;
    scope: string;
    permissions?: string[];
    azp?: string;
  };
  signature: string;
  raw: {
    header: string;
    payload: string;
    signature: string;
  };
}

async function getJwks(bindings: Bindings) {
  try {
    const response = await bindings.JWKS_SERVICE.fetch(bindings.JWKS_URL);

    if (!response.ok) {
      throw new Error("Failed to fetch jwks");
    }

    const responseBody: { keys: JwksKey[] } = await response.json();

    return responseBody.keys;
  } catch (error: any) {
    throw new HTTPException(500, {
      message: `Failed to fetch jwks: ${error.message}`,
    });
  }
}

async function isValidJwtSignature(ctx: Context, token: TokenData) {
  const encoder = new TextEncoder();
  const data = encoder.encode([token.raw.header, token.raw.payload].join("."));
  const signature = new Uint8Array(
    Array.from(token.signature).map((c) => c.charCodeAt(0)),
  );
  const jwksKeys = await getJwks(ctx.env);

  const jwksKey = jwksKeys.find((key) => key.kid === token.header.kid);

  if (!jwksKey) {
    console.log("No matching kid found");
    return false;
  }

  const key = await crypto.subtle.importKey(
    "jwk",
    jwksKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
}

/**
 * Parse and decode a JWT.
 * A JWT is three, base64 encoded, strings concatenated with ‘.’:
 *   a header, a payload, and the signature.
 * The signature is “URL safe”, in that ‘/+’ characters have been replaced by ‘_-’
 *
 * Steps:
 * 1. Split the token at the ‘.’ character
 * 2. Base64 decode the individual parts
 * 3. Retain the raw Bas64 encoded strings to verify the signature
 */
function decodeJwt(token: string): TokenData | null {
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) {
    return null;
  }

  const header = JSON.parse(atob(h));
  const payload = JSON.parse(atob(p));
  const signature = atob(s.replace(/-/g, "+").replace(/_/g, "/"));

  return {
    header,
    payload,
    signature,
    raw: { header: h, payload: p, signature: s },
  };
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

    // The basePath isn't in the types so we need to handle it manually
    let matchedPath = matchedRoute.path;

    if (
      "basePath" in matchedRoute &&
      typeof matchedRoute.basePath === "string"
    ) {
      // If the matched path starts with the basePath, we remove it
      if (matchedPath.startsWith(matchedRoute.basePath)) {
        matchedPath = matchedPath.replace(matchedRoute.basePath, "");
      }
    }

    const definition = app.openAPIRegistry.definitions.find(
      (def) =>
        "route" in def &&
        def.route.path === convertRouteSyntax(matchedPath) &&
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

      const token = decodeJwt(bearer);

      if (!token || !(await isValidJwtSignature(ctx, token))) {
        throw new HTTPException(403, { message: "Unauthorized" });
      }

      // Can we just keep the user?
      ctx.set("user_id", token.payload.sub);
      ctx.set("user", token.payload);

      const permissions = token.payload.permissions || [];
      const scopes = token.payload.scope?.split(" ") || [];

      if (
        requiredPermissions.length &&
        !(
          // Should we check both?
          (
            requiredPermissions.some((scope) => permissions.includes(scope)) ||
            requiredPermissions.some((scope) => scopes.includes(scope))
          )
        )
      ) {
        throw new HTTPException(403, { message: "Unauthorized" });
      }
    }

    // If we can't find a matching route or definition we pass on the request
    return await next();
  };
}
