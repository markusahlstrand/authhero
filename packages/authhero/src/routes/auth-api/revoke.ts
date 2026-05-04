import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { getEnrichedClient } from "../../helpers/client";
import { safeCompare } from "../../utils/safe-compare";
import { parseBasicAuthHeader } from "../../utils/auth-header";
import { setTenantId } from "../../helpers/set-tenant-id";

// RFC 7009 §2.1 — only refresh_token is currently revocable. Access tokens
// are stateless JWTs and are not tracked server-side, so the hint is accepted
// but ignored for access_token; the server still responds 200 per §2.2.
const revokeRequestSchema = z.object({
  token: z.string(),
  token_type_hint: z.enum(["refresh_token", "access_token"]).optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

export const revokeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapi(
  createRoute({
    tags: ["oauth2"],
    method: "post",
    path: "/",
    request: {
      body: {
        content: {
          "application/x-www-form-urlencoded": { schema: revokeRequestSchema },
          "application/json": { schema: revokeRequestSchema },
        },
      },
    },
    responses: {
      200: { description: "Token revoked (or no-op for unknown tokens)" },
      400: {
        description: "Bad Request",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              error_description: z.string().optional(),
            }),
          },
        },
      },
      401: {
        description: "Unauthorized — client authentication failed",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
              error_description: z.string().optional(),
            }),
          },
        },
      },
    },
  }),
  async (ctx) => {
    const contentType = ctx.req.header("Content-Type") || "";
    const body = contentType.includes("application/json")
      ? ctx.req.valid("json")
      : ctx.req.valid("form");

    const basicAuth = parseBasicAuthHeader(ctx.req.header("Authorization"));
    const params = { ...body, ...basicAuth };

    if (!params.client_id) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "client_id is required",
      });
    }

    const client = await getEnrichedClient(
      ctx.env,
      params.client_id,
      ctx.var.tenant_id,
    );

    // RFC 7009 §2.1 — confidential clients MUST authenticate. Mirror the token
    // endpoint: reject only when a wrong secret is supplied; missing secret is
    // tolerated for public clients.
    if (params.client_secret) {
      if (
        client.client_secret &&
        !safeCompare(client.client_secret, params.client_secret)
      ) {
        throw new JSONHTTPException(401, {
          error: "invalid_client",
          error_description: "Client authentication failed",
        });
      }
    }

    setTenantId(ctx, client.tenant.id);

    // Per §2.2 the server SHOULD respond 200 whether or not the token exists,
    // to prevent token-scanning probes. We only act when the token belongs to
    // the authenticating client; mismatches are silently ignored.
    if (params.token_type_hint !== "access_token") {
      const refreshToken = await ctx.env.data.refreshTokens.get(
        client.tenant.id,
        params.token,
      );

      if (
        refreshToken &&
        refreshToken.client_id === client.client_id &&
        !refreshToken.revoked_at
      ) {
        await ctx.env.data.refreshTokens.update(client.tenant.id, refreshToken.id, {
          revoked_at: new Date().toISOString(),
        });
      }
    }

    return ctx.body(null, 200, {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    });
  },
);
