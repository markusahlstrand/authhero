import { GrantType, tokenResponseSchema } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  clientCredentialsGrant,
  clientCredentialGrantParamsSchema,
} from "../../authentication-flows/client-credentials";
import {
  authorizationCodeGrantParamsSchema,
  authorizationCodeGrantUser,
} from "../../authentication-flows/authorization-code";
import {
  refreshTokenGrant,
  refreshTokenParamsSchema,
} from "../../authentication-flows/refresh-token";
import {
  passwordlessGrantParamsSchema,
  passwordlessGrantUser,
} from "../../authentication-flows/passwordless";
import { createAuthTokens } from "../../authentication-flows/common";
import { serializeAuthCookie } from "../../utils/cookies";
import { calculateScopesAndPermissions } from "../../helpers/scopes-permissions";
import { GrantFlowResult } from "src/types/GrantFlowResult";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { setTenantId } from "../../helpers/set-tenant-id";

const optionalClientCredentials = z.object({
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
});

// We need to make the client_id and client_secret optional on each type as it can be passed in a auth-header
const CreateRequestSchema = z.union([
  // Client credentials
  clientCredentialGrantParamsSchema.extend(optionalClientCredentials.shape),
  // PKCE. This needs to be before the normal code grant as the client_secret is optional here
  z.object({
    grant_type: z.literal("authorization_code"),
    client_id: z.string(),
    code: z.string(),
    redirect_uri: z.string(),
    code_verifier: z.string().min(43).max(128),
    organization: z.string().optional(),
  }),
  // Code grant
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string(),
    redirect_uri: z.string().optional(),
    organization: z.string().optional(),
    ...optionalClientCredentials.shape,
  }),
  // Refresh token
  z.object({
    grant_type: z.literal("refresh_token"),
    client_id: z.string().optional(),
    refresh_token: z.string(),
    redirect_uri: z.string().optional(),
    client_secret: z.string().optional(),
  }),
  // OTP
  z.object({
    grant_type: z.literal("http://auth0.com/oauth/grant-type/passwordless/otp"),
    client_id: z.string(),
    username: z.string(),
    otp: z.string(),
    realm: z.enum(["email", "sms"]),
  }),
]);

function parseBasicAuthHeader(authHeader?: string) {
  if (!authHeader) {
    return {};
  }

  const [type, token] = authHeader.split(" ");
  if (type?.toLowerCase() === "basic" && token) {
    const [client_id, client_secret] = atob(token).split(":");
    return { client_id, client_secret };
  }
  return {};
}

export const tokenRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /oauth/token
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth2"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: CreateRequestSchema,
            },
            "application/json": {
              schema: CreateRequestSchema,
            },
          },
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: tokenResponseSchema,
            },
          },
          description: "Tokens",
        },
        302: {
          description:
            "Redirect for further user interaction (e.g., MFA, consent).",
          headers: z.object({ Location: z.string().url() }).openapi({}),
        },
        400: {
          description: "Bad Request - The request was malformed or invalid.",
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
          description: "Unauthorized - Client authentication failed.",
          content: {
            "application/json": {
              schema: z.object({
                error: z.string(),
                error_description: z.string().optional(),
              }),
            },
          },
        },
        403: {
          description:
            "Forbidden - User is not a member of the required organization.",
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
        throw new HTTPException(400, { message: "client_id is required" });
      }
      ctx.set("client_id", params.client_id);

      let grantResult: GrantFlowResult;

      switch (body.grant_type) {
        case GrantType.AuthorizationCode:
          grantResult = await authorizationCodeGrantUser(
            ctx,
            authorizationCodeGrantParamsSchema.parse(params),
          );
          break;
        case GrantType.ClientCredential:
          grantResult = await clientCredentialsGrant(
            ctx,
            clientCredentialGrantParamsSchema.parse(params),
          );
          break;
        case GrantType.RefreshToken:
          grantResult = await refreshTokenGrant(
            ctx,
            refreshTokenParamsSchema.parse(params),
          );
          break;
        case GrantType.OTP:
          grantResult = await passwordlessGrantUser(
            ctx,
            passwordlessGrantParamsSchema.parse(params),
          );
          break;
        default:
          return ctx.json(
            {
              error: "unsupported_grant_type",
              error_description: "Grant type not implemented",
            },
            400,
          );
      }

      // Set tenant_id in context (or validate it matches if already set)
      setTenantId(ctx, grantResult.client.tenant.id);

      const passwordlessHeaders = new Headers();

      if (grantResult.session_id) {
        const passwordlessAuthCookies = serializeAuthCookie(
          grantResult.client.tenant.id,
          grantResult.session_id,
          ctx.var.host || "",
        );

        passwordlessAuthCookies.forEach((cookie) => {
          passwordlessHeaders.append("Set-Cookie", cookie);
        });
      }

      // Calculate scopes and permissions before creating tokens
      // This will throw a 403 error if user is not a member of the required organization
      let calculatedPermissions: string[] = [];

      if (grantResult.authParams.audience) {
        try {
          let scopesAndPermissions;

          if (body.grant_type === GrantType.ClientCredential) {
            scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
              grantType: GrantType.ClientCredential,
              tenantId: grantResult.client.tenant.id,
              clientId: grantResult.client.client_id,
              audience: grantResult.authParams.audience,
              requestedScopes: grantResult.authParams.scope?.split(" ") || [],
              organizationId: grantResult.organization?.id,
            });
          } else {
            // For user-based grants, userId is required
            if (!grantResult.user?.user_id) {
              throw new JSONHTTPException(400, {
                error: "invalid_request",
                error_description: "User ID is required for user-based grants",
              });
            }

            scopesAndPermissions = await calculateScopesAndPermissions(ctx, {
              grantType: body.grant_type as
                | GrantType.AuthorizationCode
                | GrantType.RefreshToken
                | GrantType.Password
                | GrantType.Passwordless
                | GrantType.OTP,
              tenantId: grantResult.client.tenant.id,
              userId: grantResult.user.user_id,
              clientId: grantResult.client.client_id,
              audience: grantResult.authParams.audience,
              requestedScopes: grantResult.authParams.scope?.split(" ") || [],
              organizationId: grantResult.organization?.id,
            });
          }

          // Update the authParams with calculated scopes and store permissions
          grantResult.authParams.scope = scopesAndPermissions.scopes.join(" ");
          calculatedPermissions = scopesAndPermissions.permissions;
        } catch (error) {
          // Re-throw HTTPExceptions (like 403 for organization membership)
          if (error instanceof HTTPException) {
            throw error;
          }
          // For other errors, log and continue with original scopes
          console.error("Error calculating scopes and permissions:", error);
        }
      }

      const tokens = await createAuthTokens(ctx, {
        ...grantResult,
        grantType: body.grant_type as GrantType,
        permissions:
          calculatedPermissions.length > 0 ? calculatedPermissions : undefined,
      });
      return ctx.json(tokens, {
        headers: passwordlessHeaders,
      });
    },
  );
