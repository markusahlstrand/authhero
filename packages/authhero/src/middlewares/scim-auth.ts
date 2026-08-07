import { Context, MiddlewareHandler } from "hono";
import { Bindings, Variables } from "../types";
import { hashScimToken } from "../helpers/scim/mint-token";
import { ScimError } from "../helpers/scim/responses";
import { waitUntil } from "../helpers/wait-until";

/**
 * The scope a request needs, by verb — the Auth0 SCIM token scope vocabulary.
 * `POST /Users/.search` is a read, so it maps to `get:users` rather than
 * `post:users`.
 */
function requiredScope(ctx: Context): string {
  const method = ctx.req.method.toUpperCase();
  if (method === "POST" && ctx.req.path.endsWith("/Users/.search")) {
    return "get:users";
  }
  switch (method) {
    case "POST":
      return "post:users";
    case "PUT":
      return "put:users";
    case "PATCH":
      return "patch:users";
    case "DELETE":
      return "delete:users";
    default:
      return "get:users";
  }
}

/**
 * Authenticates a `/scim/v2/connections/:connection_id` request with its SCIM
 * bearer token: hash the presented token, resolve it via `getByHash`, bind it
 * to the connection in the path, honour `valid_until` and the token's scopes,
 * and require a SCIM configuration on the connection. On success the token's
 * `last_used_at` is bumped. Tenant is already resolved by `tenantMiddleware`
 * upstream.
 *
 * Scopes are only enforced when the token carries them: a token minted without
 * scopes (the default, and what Auth0 treats as "all operations") can perform
 * any supported operation, while a scoped token is held to exactly what it was
 * granted.
 */
export const scimAuthMiddleware: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Variables;
}> = async (ctx, next) => {
  const tenant_id = ctx.var.tenant_id;
  if (!tenant_id) {
    throw new ScimError(401, "Unable to resolve tenant for SCIM request");
  }

  const connection_id = ctx.req.param("connection_id");
  if (!connection_id) {
    throw new ScimError(400, "Missing connection in SCIM path");
  }

  const { scimTokens, scimConfigurations } = ctx.env.data;
  if (!scimTokens || !scimConfigurations) {
    throw new ScimError(501, "SCIM is not supported by this deployment");
  }

  const authorization = ctx.req.header("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) {
    throw new ScimError(401, "Missing or malformed bearer token");
  }

  const token_hash = await hashScimToken(bearer);
  const token = await scimTokens.getByHash(tenant_id, token_hash);
  // Bind the token to the connection in the path — a token minted for one
  // connection must not provision another.
  if (!token || token.connection_id !== connection_id) {
    throw new ScimError(401, "Invalid SCIM token");
  }
  if (token.valid_until) {
    // An unparseable `valid_until` yields NaN, and every NaN comparison is
    // false — so treat it as expired rather than as "never expires".
    const validUntil = new Date(token.valid_until).getTime();
    if (Number.isNaN(validUntil) || validUntil < Date.now()) {
      throw new ScimError(401, "SCIM token has expired");
    }
  }

  const scope = requiredScope(ctx);
  if (token.scopes.length > 0 && !token.scopes.includes(scope)) {
    throw new ScimError(403, `SCIM token is missing the "${scope}" scope`);
  }

  const configuration = await scimConfigurations.get(tenant_id, connection_id);
  if (!configuration) {
    throw new ScimError(404, "SCIM is not configured for this connection");
  }

  // Usage stamp for observability only; keep it off the request's critical
  // path now that the token is fully validated.
  waitUntil(
    ctx,
    scimTokens.markUsed(tenant_id, token.token_id, new Date().toISOString()),
  );

  await next();
};
