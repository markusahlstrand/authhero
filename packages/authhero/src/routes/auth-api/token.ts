import {
  GrantType,
  LogType,
  LogTypes,
  tokenResponseSchema,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
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
import {
  tokenExchangeGrant,
  tokenExchangeParamsSchema,
  TOKEN_EXCHANGE_GRANT_TYPE,
} from "../../authentication-flows/token-exchange";
import { createAuthTokens } from "../../authentication-flows/common";
import { serializeAuthCookie } from "../../utils/cookies";
import { calculateScopesAndPermissions } from "../../helpers/scopes-permissions";
import { GrantFlowResult } from "src/types/GrantFlowResult";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { setTenantId } from "../../helpers/set-tenant-id";
import { parseBasicAuthHeader } from "../../utils/auth-header";
import {
  verifyClientAssertion,
  ClientAssertionError,
  CLIENT_ASSERTION_TYPE,
} from "../../helpers/client-assertion";
import { getEnrichedClient, EnrichedClient } from "../../helpers/client";
import { prefetchClientBundle } from "../../helpers/prefetch-client-bundle";
import { isCimdClientId } from "../../helpers/cimd";
import { getAuthUrl, getIssuer } from "../../variables";
import { resolveConnectionName } from "../../helpers/connection";
import { base64url } from "oslo/encoding";

import { defineRoute } from "../../utils/define-route";
const optionalClientCredentials = z.object({
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  client_assertion: z.string().optional(),
  client_assertion_type: z.string().optional(),
});

function peekAssertionClientId(jwt: string): string | undefined {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) return undefined;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64url.decode(parts[1], { strict: false })),
    );
    if (payload && typeof payload === "object") {
      const iss = (payload as Record<string, unknown>).iss;
      const sub = (payload as Record<string, unknown>).sub;
      if (typeof sub === "string") return sub;
      if (typeof iss === "string") return iss;
    }
  } catch {
    /* fall through — invalid JSON is caught when we verify the assertion. */
  }
  return undefined;
}

// We need to make the client_id and client_secret optional on each type as it can be passed in a auth-header
const CreateRequestSchema = z.union([
  // Client credentials
  clientCredentialGrantParamsSchema.extend(optionalClientCredentials.shape),
  // Authorization code (with optional PKCE). OAuth 2.1 / RFC 7636 allow client_secret + code_verifier together.
  z.object({
    grant_type: z.literal("authorization_code"),
    code: z.string(),
    redirect_uri: z.string().optional(),
    code_verifier: z.string().min(43).max(128).optional(),
    organization: z.string().optional(),
    ...optionalClientCredentials.shape,
  }),
  // Refresh token
  z.object({
    grant_type: z.literal("refresh_token"),
    refresh_token: z.string(),
    redirect_uri: z.string().optional(),
    organization: z.string().optional(),
    ...optionalClientCredentials.shape,
  }),
  // OTP
  z.object({
    grant_type: z.literal("http://auth0.com/oauth/grant-type/passwordless/otp"),
    client_id: z.string(),
    username: z.string(),
    otp: z.string(),
    realm: z.enum(["email", "sms"]),
  }),
  // RFC 8693 token exchange — downscope / org-switch a self-issued access
  // token. Only `urn:ietf:params:oauth:token-type:access_token` accepted.
  tokenExchangeParamsSchema.extend(optionalClientCredentials.shape),
]);

function successLogTypeForGrant(grantType: string): LogType | undefined {
  switch (grantType) {
    case GrantType.AuthorizationCode:
      return LogTypes.SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN;
    case GrantType.ClientCredential:
      return LogTypes.SUCCESS_EXCHANGE_ACCESS_TOKEN_FOR_CLIENT_CREDENTIALS;
    case GrantType.RefreshToken:
      return LogTypes.SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN;
    case GrantType.OTP:
      return LogTypes.SUCCESS_EXCHANGE_PASSWORD_OTP_FOR_ACCESS_TOKEN;
    case GrantType.TokenExchange:
      return LogTypes.SUCCESS_EXCHANGE_SUBJECT_TOKEN_FOR_ACCESS_TOKEN;
    default:
      return undefined;
  }
}
const postRoot = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
    const contentType = ctx.req.header("Content-Type") || "";
    const body = contentType.includes("application/json")
      ? ctx.req.valid("json")
      : ctx.req.valid("form");

    const basicAuth = parseBasicAuthHeader(ctx.req.header("Authorization"));
    const params: Record<string, unknown> = { ...body, ...basicAuth };

    // RFC 7523 client authentication: clients registered with
    // `private_key_jwt` or `client_secret_jwt` send a signed JWT in
    // `client_assertion`. We verify it before the grant switch so the
    // grant handlers can skip their client_secret comparison.
    const clientAssertion =
      typeof params.client_assertion === "string"
        ? params.client_assertion
        : undefined;

    // Bundle prefetch — peek the client_id (from params or from the
    // assertion's unsigned payload) and warm the bundle once, so the
    // downstream assertion check + grant handler share one cache key.
    // Swallow failures: if the client doesn't exist, we want the proper
    // RFC 6749 error from the grant handler, not a 403 here.
    const peekedClientId =
      typeof params.client_id === "string"
        ? params.client_id
        : clientAssertion
          ? peekAssertionClientId(clientAssertion)
          : undefined;
    if (peekedClientId && !isCimdClientId(peekedClientId)) {
      await prefetchClientBundle(ctx, { client_id: peekedClientId }).catch(
        () => {},
      );
    }
    const clientAssertionType =
      typeof params.client_assertion_type === "string"
        ? params.client_assertion_type
        : undefined;

    if (clientAssertion) {
      if (clientAssertionType !== CLIENT_ASSERTION_TYPE) {
        throw new JSONHTTPException(400, {
          error: "invalid_request",
          error_description: `client_assertion_type must be ${CLIENT_ASSERTION_TYPE}`,
        });
      }
      // RFC 6749 §2.3: a client MUST NOT use more than one auth method.
      if (
        typeof params.client_secret === "string" ||
        basicAuth?.client_secret
      ) {
        throw new JSONHTTPException(400, {
          error: "invalid_request",
          error_description:
            "client_secret and client_assertion are mutually exclusive",
        });
      }

      const explicitClientId =
        typeof params.client_id === "string" ? params.client_id : undefined;
      const assertionClientId =
        explicitClientId ?? peekAssertionClientId(clientAssertion);
      if (!assertionClientId) {
        throw new JSONHTTPException(400, {
          error: "invalid_request",
          error_description:
            "client_id could not be determined from client_assertion",
        });
      }

      let assertionClient: EnrichedClient;
      try {
        assertionClient = await getEnrichedClient(
          ctx.env,
          assertionClientId,
          ctx.var.tenant_id,
        );
      } catch {
        throw new JSONHTTPException(401, {
          error: "invalid_client",
          error_description: "client not found",
        });
      }

      const tokenEndpoint = `${getAuthUrl(ctx.env, ctx.var.custom_domain)}oauth/token`;
      const issuer = getIssuer(ctx.env, ctx.var.custom_domain);

      try {
        const verified = await verifyClientAssertion(
          clientAssertion,
          assertionClient,
          { acceptedAudiences: [tokenEndpoint, issuer] },
        );
        // RFC 7521 §4.2: the assertion authentication method MUST match the
        // method the client registered. Block clients that registered with a
        // non-assertion method (or `none`) from authenticating via assertion.
        const registered = assertionClient.token_endpoint_auth_method;
        if (registered === "none") {
          throw new JSONHTTPException(401, {
            error: "invalid_client",
            error_description:
              "public clients must not authenticate with client_assertion",
          });
        }
        if (
          (registered === "client_secret_jwt" ||
            registered === "private_key_jwt") &&
          registered !== verified.method
        ) {
          throw new JSONHTTPException(401, {
            error: "invalid_client",
            error_description: `client_assertion method ${verified.method} does not match registered token_endpoint_auth_method ${registered}`,
          });
        }
        params.client_id = verified.clientId;
        ctx.set("client_authenticated_via_assertion", true);
      } catch (e) {
        if (e instanceof ClientAssertionError) {
          // RFC 6749 §5.2 enumerates the valid `error` values for the token
          // endpoint. Translate internal assertion error codes to those.
          const error =
            e.code === "unsupported_alg" ? "invalid_request" : "invalid_client";
          throw new JSONHTTPException(401, {
            error,
            error_description: e.message,
          });
        }
        throw e;
      }
    }

    if (typeof params.client_id !== "string" || !params.client_id) {
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
      case TOKEN_EXCHANGE_GRANT_TYPE:
        grantResult = await tokenExchangeGrant(
          ctx,
          tokenExchangeParamsSchema.parse(params),
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

    // RFC 6749 §5.2: reject grants the client is not registered for. Only
    // enforced when the client explicitly lists `grant_types` — clients with
    // an empty/undefined list (legacy / unconfigured) keep working as before.
    const allowedGrantTypes = grantResult.client.grant_types;
    if (
      allowedGrantTypes &&
      allowedGrantTypes.length > 0 &&
      !allowedGrantTypes.includes(body.grant_type)
    ) {
      logMessage(ctx, grantResult.client.tenant.id, {
        type: LogTypes.FAILED_LOGIN,
        description: `Grant type "${body.grant_type}" is not allowed for this client`,
      });
      throw new JSONHTTPException(400, {
        error: "unauthorized_client",
        error_description: `The grant type "${body.grant_type}" is not allowed for this client`,
      });
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
    let tokenLifetime: number | undefined;

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
              | GrantType.OTP
              | GrantType.TokenExchange,
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

        // Use token_lifetime_for_web for SPA clients, token_lifetime for all others
        tokenLifetime =
          grantResult.client.app_type === "spa"
            ? (scopesAndPermissions.token_lifetime_for_web ??
              scopesAndPermissions.token_lifetime)
            : scopesAndPermissions.token_lifetime;
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
      token_lifetime: tokenLifetime,
    });

    const successLogType = successLogTypeForGrant(body.grant_type);
    if (successLogType) {
      const executionId = ctx.var.action_execution_id;
      const grantUser = grantResult.user;
      // The connection/strategy actually used to authenticate: the login
      // session's stored auth_connection/auth_strategy when the grant carries
      // one (authorization_code), else the flow's explicit authConnection
      // (refresh_token, passwordless), else the user's own connection.
      const authStrategy = grantResult.loginSession?.auth_strategy;
      logMessage(ctx, grantResult.client.tenant.id, {
        type: successLogType,
        userId: grantUser?.user_id,
        username: grantUser
          ? grantUser.email || grantUser.phone_number || grantUser.name
          : undefined,
        connection: resolveConnectionName({
          loginSession: grantResult.loginSession,
          authConnection: grantResult.authConnection,
          user: grantUser,
        }),
        strategy: authStrategy?.strategy,
        strategy_type: authStrategy?.strategy_type,
        client_name: grantResult.client.name,
        scope: grantResult.authParams.scope,
        audience: grantResult.authParams.audience,
        ...(executionId ? { details: { execution_id: executionId } } : {}),
      });
    }

    passwordlessHeaders.set("Cache-Control", "no-store");
    passwordlessHeaders.set("Pragma", "no-cache");

    return ctx.json(tokens, {
      headers: passwordlessHeaders,
    });
  },
});

export const tokenRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([postRoot] as const);
