import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "@hono/zod-openapi";
import {
  AuthParams,
  Connection,
  LogTypes,
  RateLimitDecision,
  TokenExchangeJwtVerification,
  TokenExchangeProfile,
  User,
} from "@authhero/adapter-interfaces";
import { JSONHTTPException } from "../errors/json-http-exception";
import { Bindings, Variables, GrantFlowUserResult } from "../types";
import { EnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { safeCompare } from "../utils/safe-compare";
import { loadJwks } from "../helpers/client-keys";
import { consumeSingleUseJti } from "../helpers/client-assertion-replay";
import { resolvePrimaryUser } from "../helpers/users";
import {
  ASYMMETRIC_JWS_ALGS,
  decodeCompactJws,
  isAsymmetricJwsAlg,
  verifyAsymmetricJwsSignature,
} from "../utils/jws-verify";
import { ssrfFetchOptionsFromEnv } from "../utils/ssrf-fetch";
import { getAuthUrl, getIssuer } from "../variables";
import { getProviderFromConnection } from "../strategies";
import {
  CodeHookApi,
  HandleCodeHookOutcome,
  executeCodeHook,
  persistActionExecution,
} from "../hooks/codehooks";
import {
  TOKEN_EXCHANGE_GRANT_TYPE,
  authorizeOrganizationAccess,
} from "./token-exchange";

/**
 * Custom Token Exchange (Auth0-compatible, issue #1417).
 *
 * An RFC 8693 token exchange whose `subject_token_type` names one of the
 * tenant's token exchange profiles. The profile either verifies the subject
 * token declaratively (`jwt_verification`) or runs an action on the
 * `custom-token-exchange` trigger, and in both cases decides which user the
 * exchange issues tokens for. The standard `access_token` subject token type
 * keeps going to the org-switch exchange in `token-exchange.ts`.
 */

const CUSTOM_TOKEN_EXCHANGE_TRIGGER = "custom-token-exchange";
const CUSTOM_AUTHENTICATION = "custom_authentication";
const CLOCK_SKEW_LEEWAY_SECONDS = 30;
// Bounded well under the users.user_id column once the provider prefix is
// added.
const MAX_SUB_LENGTH = 200;

export const customTokenExchangeParamsSchema = z.object({
  grant_type: z.literal(TOKEN_EXCHANGE_GRANT_TYPE),
  client_id: z.string(),
  client_secret: z.string().optional(),
  subject_token: z.string().min(1).max(16384),
  subject_token_type: z.string().min(1),
  audience: z.string().optional(),
  scope: z.string().optional(),
  organization: z.string().optional(),
});

export type CustomTokenExchangeParams = z.infer<
  typeof customTokenExchangeParamsSchema
>;

/**
 * The subject token was rejected. Counted for brute-force protection and
 * reported to the caller as RFC 8693 §2.2.2 `invalid_request`; the detail goes
 * to the tenant log only.
 */
class InvalidSubjectTokenError extends Error {}

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

type ResolvedExchangeUser = { user: User; connection?: string };

export async function customTokenExchangeGrant(
  ctx: Ctx,
  params: CustomTokenExchangeParams,
  client: EnrichedClient,
): Promise<GrantFlowUserResult> {
  const tenantId = client.tenant.id;
  const failLog = (description: string) =>
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description,
    });

  const profile = await findProfile(ctx, tenantId, params.subject_token_type);
  if (!profile) {
    failLog(`No token exchange profile for '${params.subject_token_type}'`);
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "Unsupported subject_token_type",
    });
  }

  if (
    !client.token_exchange?.allow_any_profile_of_type?.includes(
      CUSTOM_AUTHENTICATION,
    )
  ) {
    failLog("Client is not allowed to use Custom Token Exchange");
    throw new JSONHTTPException(400, {
      error: "unauthorized_client",
      error_description: "Custom Token Exchange is not enabled for this client",
    });
  }
  // Auth0 limits Custom Token Exchange to first-party applications: a
  // third-party client must not be able to mint user tokens without consent.
  if (client.is_first_party === false) {
    failLog("Third-party clients cannot use Custom Token Exchange");
    throw new JSONHTTPException(400, {
      error: "unauthorized_client",
      error_description:
        "Custom Token Exchange is only available to first-party clients",
    });
  }

  authenticateClient(ctx, client, params.client_secret, failLog);

  let resolved: ResolvedExchangeUser;
  try {
    if (profile.jwt_verification) {
      resolved = await resolveUserFromJwt(
        ctx,
        client,
        profile,
        profile.jwt_verification,
        params.subject_token,
      );
    } else if (profile.action_id) {
      resolved = await resolveUserFromAction(
        ctx,
        client,
        profile,
        profile.action_id,
        params,
      );
    } else {
      failLog(`Token exchange profile ${profile.id} has nothing to run`);
      throw new JSONHTTPException(500, {
        error: "server_error",
        error_description: "Token exchange profile is misconfigured",
      });
    }
  } catch (error) {
    if (error instanceof InvalidSubjectTokenError) {
      failLog(`Invalid subject token: ${error.message}`);
      await countInvalidSubjectToken(ctx, tenantId);
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "Invalid subject token",
      });
    }
    throw error;
  }

  // Resolve to the cluster root so a linked secondary identity always issues
  // tokens for the primary user, like every other grant.
  const user = await resolvePrimaryUser(
    ctx.env.data.users,
    tenantId,
    resolved.user,
  );
  if (user.linked_to) {
    failLog(`Linked user ${resolved.user.user_id} has no reachable primary`);
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "Subject token user could not be resolved",
    });
  }
  ctx.set("user_id", user.user_id);
  if (resolved.connection) ctx.set("connection", resolved.connection);

  const organization = params.organization
    ? await authorizeOrganizationAccess(ctx, {
        tenantId,
        userId: user.user_id,
        organizationId: params.organization,
        failLog,
      })
    : undefined;

  const authParams: AuthParams = {
    client_id: client.client_id,
    audience: params.audience,
    scope: params.scope,
    organization: organization?.id,
  };

  return {
    user,
    client,
    authParams,
    organization,
    authConnection: resolved.connection ?? user.connection,
  };
}

async function findProfile(
  ctx: Ctx,
  tenantId: string,
  subjectTokenType: string,
): Promise<TokenExchangeProfile | undefined> {
  const adapter = ctx.env.data.tokenExchangeProfiles;
  if (!adapter) return undefined;
  const profiles = await adapter.list(tenantId);
  return profiles.find(
    (profile) => profile.subject_token_type === subjectTokenType,
  );
}

/**
 * RFC 6749 §2.3: confidential clients must authenticate. Public clients
 * (`token_endpoint_auth_method: none`) may exchange too, as on Auth0 — the
 * signed subject token is what proves the user, and invalid tokens are
 * throttled by {@link countInvalidSubjectToken}.
 */
function authenticateClient(
  ctx: Ctx,
  client: EnrichedClient,
  clientSecret: string | undefined,
  failLog: (description: string) => void,
): void {
  if (ctx.var.client_authenticated_via_assertion === true) return;
  if (client.token_endpoint_auth_method === "none") return;

  if (!clientSecret) {
    failLog("Missing client_secret");
    throw new JSONHTTPException(401, {
      error: "invalid_client",
      error_description: "client_secret is required",
    });
  }
  if (
    !client.client_secret ||
    !safeCompare(client.client_secret, clientSecret)
  ) {
    failLog("Invalid client credentials");
    throw new JSONHTTPException(401, {
      error: "invalid_client",
      error_description: "Client authentication failed",
    });
  }
}

/**
 * Count a rejected subject token against the caller's IP. Once the backend's
 * limit is reached the caller gets 429 instead of 400. Successful exchanges
 * are not counted. Fails open when the adapter errors, like the other
 * brute-force call sites.
 */
async function countInvalidSubjectToken(
  ctx: Ctx,
  tenantId: string,
): Promise<void> {
  const rateLimit = ctx.env.data.rateLimit;
  if (!rateLimit) return;

  let decision: RateLimitDecision = { allowed: true };
  try {
    decision = await rateLimit.consume(
      "brute-force",
      `custom-token-exchange:${tenantId}:${ctx.var.ip || "unknown"}`,
    );
  } catch (error) {
    console.error("Custom token exchange rate limit consume failed:", error);
  }
  if (!decision.allowed) {
    const headers: Record<string, string> = {};
    if (typeof decision.retryAfterSeconds === "number") {
      headers["Retry-After"] = String(decision.retryAfterSeconds);
    }
    throw new HTTPException(429, {
      res: new Response(
        JSON.stringify({
          error: "too_many_attempts",
          error_description: "Too many invalid subject tokens",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json", ...headers },
        },
      ),
    });
  }
}

// ---------------------------------------------------------------------------
// Declarative verification
// ---------------------------------------------------------------------------

async function resolveUserFromJwt(
  ctx: Ctx,
  client: EnrichedClient,
  profile: TokenExchangeProfile,
  config: TokenExchangeJwtVerification,
  subjectToken: string,
): Promise<ResolvedExchangeUser> {
  const tenantId = client.tenant.id;
  const payload = await verifySubjectJwt(ctx, profile, config, subjectToken);
  const sub = payload.sub;
  if (typeof sub !== "string") {
    throw new InvalidSubjectTokenError("sub claim is required");
  }

  const mapping = config.user_mapping;
  if (mapping.type === "user_id") {
    const user = await ctx.env.data.users.get(tenantId, sub);
    if (!user) {
      throw new InvalidSubjectTokenError(`user ${sub} does not exist`);
    }
    return { user };
  }

  const connection = await getConnectionByName(
    ctx,
    tenantId,
    mapping.connection,
  );
  const user = await findOrCreateConnectionUser(ctx, client, connection, {
    user_id: sub,
    attributes: {
      email: stringClaim(payload.email),
      email_verified:
        mapping.trust_email_verified === true &&
        payload.email_verified === true,
      name: stringClaim(payload.name),
      given_name: stringClaim(payload.given_name),
      family_name: stringClaim(payload.family_name),
      nickname: stringClaim(payload.nickname),
      picture: stringClaim(payload.picture),
      phone_number: stringClaim(payload.phone_number),
    },
    create: mapping.create_if_not_exists !== false,
    update: false,
  });
  if (!user) {
    throw new InvalidSubjectTokenError(
      `user ${sub} does not exist in connection ${connection.name}`,
    );
  }
  return { user, connection: connection.name };
}

/**
 * Verify the subject token against the profile: signature by one of the
 * registered keys with an allowed asymmetric algorithm, then `iss`, `aud`,
 * `exp`/`nbf`/`iat` within the lifetime bound, and a single-use `jti`.
 */
async function verifySubjectJwt(
  ctx: Ctx,
  profile: TokenExchangeProfile,
  config: TokenExchangeJwtVerification,
  subjectToken: string,
): Promise<Record<string, unknown>> {
  const tenantId = ctx.var.tenant_id;
  const decoded = decodeCompactJws(subjectToken);
  if (!decoded) {
    throw new InvalidSubjectTokenError("subject token is not a compact JWS");
  }
  const { header, payload } = decoded;

  const allowedAlgs = config.algorithms ?? ASYMMETRIC_JWS_ALGS;
  if (!isAsymmetricJwsAlg(header.alg) || !allowedAlgs.includes(header.alg)) {
    throw new InvalidSubjectTokenError(
      `alg ${String(header.alg)} is not accepted`,
    );
  }

  let jwks;
  try {
    jwks = await loadJwks(config, { fetch: ssrfFetchOptionsFromEnv(ctx.env) });
  } catch (error) {
    // A key-loading failure is our (or the issuer's) problem, not an invalid
    // token — don't count it against the caller.
    const message = error instanceof Error ? error.message : String(error);
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description: `Could not load keys for token exchange profile ${profile.id}: ${message}`,
    });
    throw new JSONHTTPException(500, {
      error: "server_error",
      error_description: "Could not load subject token verification keys",
    });
  }

  const signature = await verifyAsymmetricJwsSignature({
    signedInput: decoded.signedInput,
    signature: decoded.signature,
    alg: header.alg,
    kid: typeof header.kid === "string" ? header.kid : undefined,
    jwks,
  });
  if (!signature.verified) {
    throw new InvalidSubjectTokenError(
      signature.reason === "no_matching_key"
        ? "no registered key matches the token's kid/alg"
        : "signature did not verify",
    );
  }

  if (payload.iss !== config.issuer) {
    throw new InvalidSubjectTokenError(
      `iss ${String(payload.iss)} does not match ${config.issuer}`,
    );
  }

  const acceptedAudiences = config.audience ?? [
    getIssuer(ctx.env, ctx.var.custom_domain),
    `${getAuthUrl(ctx.env, ctx.var.custom_domain)}oauth/token`,
  ];
  const aud = payload.aud;
  const audValues =
    typeof aud === "string"
      ? [aud]
      : Array.isArray(aud)
        ? aud.filter((value): value is string => typeof value === "string")
        : [];
  if (!audValues.some((value) => acceptedAudiences.includes(value))) {
    throw new InvalidSubjectTokenError(
      `aud must include one of: ${acceptedAudiences.join(", ")}`,
    );
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const leeway = CLOCK_SKEW_LEEWAY_SECONDS;
  const maxLifetime = config.max_lifetime_seconds ?? 300;
  const exp = payload.exp;
  if (typeof exp !== "number") {
    throw new InvalidSubjectTokenError("exp claim is required");
  }
  if (exp + leeway < nowSec) {
    throw new InvalidSubjectTokenError("subject token has expired");
  }
  if (exp - leeway > nowSec + maxLifetime) {
    throw new InvalidSubjectTokenError(
      `subject token must not expire more than ${maxLifetime}s from now`,
    );
  }
  if (typeof payload.iat === "number") {
    if (payload.iat - leeway > nowSec) {
      throw new InvalidSubjectTokenError("iat is in the future");
    }
    if (exp - payload.iat > maxLifetime) {
      throw new InvalidSubjectTokenError(
        `subject token lifetime must not exceed ${maxLifetime}s`,
      );
    }
  }
  if (typeof payload.nbf === "number" && payload.nbf - leeway > nowSec) {
    throw new InvalidSubjectTokenError("subject token is not yet valid");
  }

  const sub = payload.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new InvalidSubjectTokenError("sub claim is required");
  }
  if (sub.length > MAX_SUB_LENGTH) {
    throw new InvalidSubjectTokenError("sub claim is too long");
  }

  const jti = payload.jti;
  if (typeof jti === "string" && jti.length > 0) {
    const fresh = await consumeSingleUseJti(ctx, tenantId, {
      codeType: "subject_token_jti",
      namespace: `subject_token:${profile.id}`,
      jti,
      exp,
    });
    if (!fresh) {
      throw new InvalidSubjectTokenError("subject token has already been used");
    }
  } else if (config.require_jti !== false) {
    throw new InvalidSubjectTokenError("jti claim is required");
  }

  return payload;
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

const setUserByConnectionAttributesSchema = z.object({
  user_id: z.string().min(1).max(MAX_SUB_LENGTH),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  phone_number: z.string().optional(),
  phone_verified: z.boolean().optional(),
  username: z.string().optional(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  nickname: z.string().optional(),
  picture: z.string().optional(),
});

const setUserByConnectionOptionsSchema = z
  .object({
    creationBehavior: z
      .enum(["create_if_not_exists", "none"])
      .default("create_if_not_exists"),
    updateBehavior: z.enum(["replace", "none"]).default("none"),
  })
  .default({
    creationBehavior: "create_if_not_exists",
    updateBehavior: "none",
  });

type ActionUserSelection =
  | { kind: "user_id"; userId: string }
  | {
      kind: "connection";
      connection: string;
      attributes: z.infer<typeof setUserByConnectionAttributesSchema>;
      options: z.infer<typeof setUserByConnectionOptionsSchema>;
    };

async function resolveUserFromAction(
  ctx: Ctx,
  client: EnrichedClient,
  profile: TokenExchangeProfile,
  actionId: string,
  params: CustomTokenExchangeParams,
): Promise<ResolvedExchangeUser> {
  const tenantId = client.tenant.id;
  const codeExecutor = ctx.env.codeExecutor;
  if (!codeExecutor) {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description: `Token exchange profile ${profile.id} needs an action but no code executor is configured`,
    });
    throw new JSONHTTPException(500, {
      error: "server_error",
      error_description: "Custom Token Exchange actions are not available",
    });
  }

  const selections: ActionUserSelection[] = [];
  let invalidSubjectTokenReason: string | undefined;

  const api: CodeHookApi = {
    authentication: {
      setUserById: (userId: unknown) => {
        if (typeof userId !== "string" || userId.length === 0) {
          throw new ActionContractError("setUserById needs a user_id string");
        }
        selections.push({ kind: "user_id", userId });
      },
      setUserByConnection: (
        connection: unknown,
        attributes: unknown,
        options: unknown,
      ) => {
        if (typeof connection !== "string" || connection.length === 0) {
          throw new ActionContractError(
            "setUserByConnection needs a connection name",
          );
        }
        const parsedAttributes =
          setUserByConnectionAttributesSchema.safeParse(attributes);
        if (!parsedAttributes.success) {
          throw new ActionContractError(
            `setUserByConnection user attributes are invalid: ${parsedAttributes.error.issues
              .map((issue) => `${issue.path.join(".")} ${issue.message}`)
              .join("; ")}`,
          );
        }
        const parsedOptions =
          setUserByConnectionOptionsSchema.safeParse(options);
        if (!parsedOptions.success) {
          throw new ActionContractError(
            "setUserByConnection options are invalid",
          );
        }
        selections.push({
          kind: "connection",
          connection,
          attributes: parsedAttributes.data,
          options: parsedOptions.data,
        });
      },
    },
    access: {
      deny: (code: unknown, reason: unknown) => {
        throw new JSONHTTPException(400, {
          error: typeof code === "string" && code ? code : "access_denied",
          error_description:
            typeof reason === "string" && reason ? reason : "Access denied",
        });
      },
      rejectInvalidSubjectToken: (reason: unknown) => {
        invalidSubjectTokenReason =
          typeof reason === "string" && reason ? reason : "rejected by action";
      },
    },
  };

  const event = {
    client,
    tenant: { id: tenantId },
    transaction: {
      subject_token: params.subject_token,
      subject_token_type: params.subject_token_type,
      requested_scopes: params.scope?.split(" ").filter(Boolean) ?? [],
      audience: params.audience,
      organization: params.organization,
    },
    resource_server: params.audience
      ? { identifier: params.audience }
      : undefined,
    request: {
      ip: ctx.var.ip || "",
      user_agent: ctx.var.useragent || "",
      hostname: ctx.var.host,
      method: ctx.req.method,
      url: ctx.req.url,
    },
  };

  let outcome: HandleCodeHookOutcome;
  try {
    outcome = await executeCodeHook({
      codeExecutor,
      data: ctx.env.data,
      tenantId,
      hook: { code_id: actionId },
      event,
      triggerId: CUSTOM_TOKEN_EXCHANGE_TRIGGER,
      api,
    });
  } catch (error) {
    const denied = error instanceof HTTPException;
    await recordExecution(ctx, tenantId, {
      result: {
        action_name: actionId,
        error: {
          id: denied ? "access_denied" : "execution_threw",
          msg: error instanceof Error ? error.message : String(error),
        },
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      },
      logs: [],
      denied,
    });
    if (error instanceof ActionContractError) {
      logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
        description: `Action ${actionId}: ${error.message}`,
      });
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "The token exchange action returned an invalid user",
      });
    }
    throw error;
  }
  await recordExecution(ctx, tenantId, outcome);

  if (outcome.result.error) {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description: `Action ${actionId} failed: ${outcome.result.error.msg}`,
    });
    throw new JSONHTTPException(500, {
      error: "server_error",
      error_description: "The token exchange action failed",
    });
  }

  if (invalidSubjectTokenReason !== undefined) {
    throw new InvalidSubjectTokenError(invalidSubjectTokenReason);
  }

  if (selections.length !== 1) {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description: `Action ${actionId} must call exactly one of setUserById / setUserByConnection (called ${selections.length})`,
    });
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "The token exchange action did not set a user",
    });
  }

  const selection = selections[0]!;
  if (selection.kind === "user_id") {
    const user = await ctx.env.data.users.get(tenantId, selection.userId);
    if (!user) {
      logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
        description: `Action ${actionId} set unknown user ${selection.userId}`,
      });
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "The token exchange action set an unknown user",
      });
    }
    return { user };
  }

  const connection = await getConnectionByName(
    ctx,
    tenantId,
    selection.connection,
  );
  const { user_id, ...attributes } = selection.attributes;
  const user = await findOrCreateConnectionUser(ctx, client, connection, {
    user_id,
    attributes,
    create: selection.options.creationBehavior === "create_if_not_exists",
    update: selection.options.updateBehavior === "replace",
  });
  if (!user) {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description: `Action ${actionId} set unknown user ${user_id} in connection ${connection.name} with creationBehavior none`,
    });
    throw new JSONHTTPException(400, {
      error: "invalid_request",
      error_description: "The token exchange action set an unknown user",
    });
  }
  return { user, connection: connection.name };
}

/** The action called an `api.authentication` setter with unusable input. */
class ActionContractError extends Error {}

async function recordExecution(
  ctx: Ctx,
  tenantId: string,
  outcome: HandleCodeHookOutcome,
): Promise<void> {
  try {
    const executionId = await persistActionExecution(
      ctx.env.data,
      tenantId,
      CUSTOM_TOKEN_EXCHANGE_TRIGGER,
      [outcome],
    );
    if (executionId) ctx.set("action_execution_id", executionId);
  } catch (error) {
    console.error("Failed to persist custom token exchange execution:", error);
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

async function getConnectionByName(
  ctx: Ctx,
  tenantId: string,
  name: string,
): Promise<Connection> {
  const { connections } = await ctx.env.data.connections.list(tenantId);
  const connection = connections.find((c) => c.name === name);
  if (!connection) {
    logMessage(ctx, tenantId, {
      type: LogTypes.FAILED_EXCHANGE_CUSTOM_TOKEN,
      description: `Connection '${name}' does not exist`,
    });
    throw new JSONHTTPException(500, {
      error: "server_error",
      error_description: "Token exchange connection is misconfigured",
    });
  }
  return connection;
}

type ConnectionUserAttributes = {
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_verified?: boolean;
  username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  picture?: string;
};

// Auth0: these cannot change on an existing user through
// setUserByConnection's updateBehavior "replace".
type ReplaceableAttributes = Omit<
  ConnectionUserAttributes,
  "email" | "email_verified" | "phone_number" | "phone_verified" | "username"
>;

/**
 * Look up `<strategy>|<user_id>` in the connection and optionally create or
 * update it. Returns null when the user doesn't exist and creation is off.
 * Creation goes through the hook-wrapped users adapter, so registration hooks
 * and account linking run as for any other new user.
 */
async function findOrCreateConnectionUser(
  ctx: Ctx,
  client: EnrichedClient,
  connection: Connection,
  params: {
    user_id: string;
    attributes: ConnectionUserAttributes;
    create: boolean;
    update: boolean;
  },
): Promise<User | null> {
  const tenantId = client.tenant.id;
  const provider = getProviderFromConnection(connection);
  const userId = `${provider}|${params.user_id}`;
  const attributes = params.attributes;

  const existing = await ctx.env.data.users.get(tenantId, userId);
  if (existing) {
    if (params.update) {
      const replaceable: ReplaceableAttributes = {
        name: attributes.name,
        given_name: attributes.given_name,
        family_name: attributes.family_name,
        nickname: attributes.nickname,
        picture: attributes.picture,
      };
      const updates = Object.fromEntries(
        Object.entries(replaceable).filter(([, value]) => value !== undefined),
      );
      if (Object.keys(updates).length > 0) {
        await ctx.env.data.users.update(tenantId, userId, updates);
        return { ...existing, ...updates };
      }
    }
    return existing;
  }

  if (!params.create) return null;

  try {
    return await ctx.env.data.users.create(tenantId, {
      user_id: userId,
      provider,
      connection: connection.name,
      email: attributes.email,
      email_verified: attributes.email_verified ?? false,
      phone_number: attributes.phone_number,
      phone_verified: attributes.phone_verified,
      username: attributes.username,
      name: attributes.name ?? attributes.email ?? params.user_id,
      given_name: attributes.given_name,
      family_name: attributes.family_name,
      nickname: attributes.nickname,
      picture: attributes.picture,
      is_social: false,
      last_ip: ctx.var.ip || "",
      last_login: new Date().toISOString(),
    });
  } catch (error) {
    // A concurrent exchange for the same subject created the user first.
    const isConflict =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 409;
    if (!isConflict) throw error;
    const winner = await ctx.env.data.users.get(tenantId, userId);
    if (!winner) throw error;
    return winner;
  }
}
