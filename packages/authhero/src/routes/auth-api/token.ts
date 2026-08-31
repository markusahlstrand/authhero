import {
  GrantType,
  LogType,
  LogTypes,
  tokenResponseSchema,
  decodeBase64Url,
} from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { Bindings, Variables } from "../../types";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Context } from "hono";
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
  passwordlessOtpGrant,
} from "../../authentication-flows/passwordless";
import {
  tokenExchangeGrant,
  tokenExchangeParamsSchema,
  TOKEN_EXCHANGE_GRANT_TYPE,
} from "../../authentication-flows/token-exchange";
import { issueTokensForGrant } from "../../authentication-flows/grant-tokens";
import { serializeAuthCookie } from "../../utils/cookies";
import { GrantFlowResult } from "src/types/GrantFlowResult";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { setTenantId } from "../../helpers/set-tenant-id";
import { parseBasicAuthHeader } from "../../utils/auth-header";
import {
  verifyClientAssertion,
  ClientAssertionError,
  CLIENT_ASSERTION_TYPE,
} from "../../helpers/client-assertion";
import { consumeClientAssertionJti } from "../../helpers/client-assertion-replay";
import { getEnrichedClient, EnrichedClient } from "../../helpers/client";
import { prefetchClientBundle } from "../../helpers/prefetch-client-bundle";
import { isCimdClientId } from "../../helpers/cimd";
import { getAuthUrl, getIssuer } from "../../variables";
import { resolveConnectionName } from "../../helpers/connection";
import { defineRoute } from "../../utils/define-route";
import { ssrfFetchOptionsFromEnv } from "../../utils/ssrf-fetch";
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
      new TextDecoder().decode(decodeBase64Url(parts[1])),
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

/**
 * RFC 6749 §5.2: reject grants the client is not registered for. Only
 * enforced when the client explicitly lists `grant_types` — clients with an
 * empty/undefined list (legacy / unconfigured) keep working as before.
 */
function assertGrantTypeAllowed(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  grantType: string,
): void {
  const allowedGrantTypes = client.grant_types;
  if (
    allowedGrantTypes &&
    allowedGrantTypes.length > 0 &&
    !allowedGrantTypes.includes(grantType)
  ) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_LOGIN,
      description: `Grant type "${grantType}" is not allowed for this client`,
    });
    throw new JSONHTTPException(400, {
      error: "unauthorized_client",
      error_description: `The grant type "${grantType}" is not allowed for this client`,
    });
  }
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
    // Auth0 accepts scope and audience on this grant too — without them a
    // caller can only inherit what /passwordless/start stored.
    scope: z.string().optional(),
    audience: z.string().optional(),
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
          {
            acceptedAudiences: [tokenEndpoint, issuer],
            leewaySeconds: ctx.env.CLIENT_ASSERTION_LEEWAY_SECONDS,
            maxLifetimeSeconds: ctx.env.CLIENT_ASSERTION_MAX_LIFETIME_SECONDS,
          },
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
        // RFC 7523 §3: the assertion's `jti` makes it single use. Spend it
        // after the signature and method checks and before the client counts
        // as authenticated, so a captured assertion cannot be replayed for the
        // rest of its lifetime.
        const jtiConsumed = await consumeClientAssertionJti(
          ctx,
          ctx.var.tenant_id,
          {
            clientId: verified.clientId,
            jti: verified.jti,
            exp: verified.exp,
          },
        );
        if (!jtiConsumed) {
          throw new JSONHTTPException(401, {
            error: "invalid_client",
            error_description: "client_assertion has already been used",
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

    // Resolve the client once, up front, and enforce its `grant_types`
    // allowlist *before* dispatching to the grant flow. Otherwise a rejected
    // request has already burned the OTP / authorization code and, for the
    // passwordless grant, created a session and refresh token that never
    // reach the client (issue #1285). The resolved client is handed to the
    // flow so it is not looked up (or, for CIMD clients, re-fetched) twice.
    const client = await getEnrichedClient(
      ctx.env,
      params.client_id,
      ctx.var.tenant_id,
      ssrfFetchOptionsFromEnv(ctx.env),
    );
    assertGrantTypeAllowed(ctx, client, body.grant_type);

    let grantResult: GrantFlowResult;

    switch (body.grant_type) {
      case GrantType.AuthorizationCode:
        grantResult = await authorizationCodeGrantUser(
          ctx,
          authorizationCodeGrantParamsSchema.parse(params),
          client,
        );
        break;
      case GrantType.ClientCredential:
        grantResult = await clientCredentialsGrant(
          ctx,
          clientCredentialGrantParamsSchema.parse(params),
          client,
        );
        break;
      case GrantType.RefreshToken:
        grantResult = await refreshTokenGrant(
          ctx,
          refreshTokenParamsSchema.parse(params),
          client,
        );
        break;
      case GrantType.OTP:
        grantResult = await passwordlessOtpGrant(
          ctx,
          passwordlessGrantParamsSchema.parse(params),
          client,
        );
        break;
      case TOKEN_EXCHANGE_GRANT_TYPE:
        grantResult = await tokenExchangeGrant(
          ctx,
          tokenExchangeParamsSchema.parse(params),
          client,
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

    const tokens = await issueTokensForGrant(
      ctx,
      grantResult,
      body.grant_type as GrantType,
    );

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
