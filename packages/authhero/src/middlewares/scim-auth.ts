import { MiddlewareHandler } from "hono";
import { Bindings, Variables } from "../types";
import { hashScimToken } from "../helpers/scim/mint-token";
import { ScimError } from "../helpers/scim/responses";

/**
 * Authenticates a `/scim/v2/connections/:connection_id` request with its SCIM
 * bearer token: hash the presented token, resolve it via `getByHash`, bind it
 * to the connection in the path, honour `valid_until`, and require a SCIM
 * configuration on the connection. On success the token's `last_used_at` is
 * bumped. Tenant is already resolved by `tenantMiddleware` upstream.
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
  if (token.valid_until && new Date(token.valid_until).getTime() < Date.now()) {
    throw new ScimError(401, "SCIM token has expired");
  }

  const configuration = await scimConfigurations.get(tenant_id, connection_id);
  if (!configuration) {
    throw new ScimError(404, "SCIM is not configured for this connection");
  }

  // Usage stamp for observability; a cheap single-row update.
  await scimTokens.markUsed(
    tenant_id,
    token.token_id,
    new Date().toISOString(),
  );

  await next();
};
