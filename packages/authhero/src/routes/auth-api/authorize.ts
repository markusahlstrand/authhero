import { verifyRequestOrigin } from "oslo/request";
import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  AuthParams,
  AuthorizationResponseMode,
  AuthorizationResponseType,
  ClaimsRequest,
  CodeChallengeMethod,
  LoginSession,
  LoginSessionState,
  Strategy,
  claimsRequestSchema,
  isDatabaseConnectionStrategy,
  tokenResponseSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { isValidRedirectUrl } from "../../utils/is-valid-redirect-url";
import { getAllAuthCookies } from "../../utils/cookies";
import { universalAuth } from "../../authentication-flows/universal";
import { ticketAuth } from "../../authentication-flows/ticket";
import { silentAuth } from "../../authentication-flows/silent";
import { connectionAuth } from "../../authentication-flows/connection";
import { resumeLoginSession } from "../../authentication-flows/resume";
import { getEnrichedClient } from "../../helpers/client";
import { prefetchClientBundle } from "../../helpers/prefetch-client-bundle";
import { isCimdClientId } from "../../helpers/cimd";
import { getIssuer, getUniversalLoginUrl } from "../../variables";
import { formPostResponse } from "../../utils/form-post";
import { setTenantId } from "../../helpers/set-tenant-id";
import { defineRoute } from "../../utils/define-route";
import {
  verifyRequestObject,
  RequestObjectVerificationError,
} from "../../helpers/request-object";
import {
  ssrfSafeFetch,
  SsrfBlockedError,
  SsrfFetchOptions,
  ssrfFetchOptionsFromEnv,
} from "../../utils/ssrf-fetch";

const UI_STRATEGIES: string[] = [
  Strategy.EMAIL,
  Strategy.SMS,
  Strategy.USERNAME_PASSWORD,
];

// OIDC Core 3.1.2.1: response_type is a space-separated SET — order doesn't
// matter. The conformance suite sends the IANA-canonical order (`id_token
// token`, `code id_token`, etc.); some Auth0-era clients still send the
// alternate order (`token id_token`). Normalize to canonical form before
// enum validation so both pass the same validation gate.
const RESPONSE_TYPE_ORDER = ["code", "id_token", "token"];
function canonicalizeResponseType(raw: string): string {
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return raw;
  return [...tokens]
    .sort(
      (a, b) => RESPONSE_TYPE_ORDER.indexOf(a) - RESPONSE_TYPE_ORDER.indexOf(b),
    )
    .join(" ");
}

// Schema for the authorize query parameters (shared between query and request JWT)
const authorizeParamsSchema = z.object({
  client_id: z.string().optional(),
  vendor_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  scope: z.string().optional(),
  state: z.string().optional(),
  prompt: z.string().optional(),
  response_mode: z.nativeEnum(AuthorizationResponseMode).optional(),
  response_type: z.preprocess(
    (val) => (typeof val === "string" ? canonicalizeResponseType(val) : val),
    z.nativeEnum(AuthorizationResponseType).optional(),
  ),
  audience: z.string().optional(),
  connection: z.string().optional(),
  nonce: z.string().optional(),
  max_age: z.string().optional(),
  acr_values: z.string().optional(),
  login_ticket: z.string().optional(),
  code_challenge_method: z.nativeEnum(CodeChallengeMethod).optional(),
  code_challenge: z.string().optional(),
  realm: z.string().optional(),
  auth0Client: z.string().optional(),
  organization: z.string().optional(),
  login_hint: z.string().optional(),
  screen_hint: z.string().optional(),
  ui_locales: z.string().optional(),
  // OIDC Core 5.5 — JSON-encoded `claims` request parameter. Inside a signed
  // Request Object (RFC 9101 §4) the value is a JSON object, not a string —
  // accept both shapes so verified request payloads pass schema validation.
  claims: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
});

// Parse + validate the raw `claims` value. Accepts either a JSON-encoded
// string (query-string form) or a decoded object (Request Object form per
// RFC 9101 §4). Returns the parsed request, or throws HTTPException(400)
// per OIDC Core 5.5 when the value is not a valid claims-request shape.
function parseClaimsParam(
  raw: string | Record<string, unknown> | undefined,
): ClaimsRequest | undefined {
  if (raw === undefined || raw === null) return undefined;
  let decoded: unknown;
  if (typeof raw === "string") {
    if (!raw) return undefined;
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new HTTPException(400, {
        message: "invalid claims parameter: not valid JSON",
      });
    }
  } else {
    decoded = raw;
  }
  const result = claimsRequestSchema.safeParse(decoded);
  if (!result.success) {
    throw new HTTPException(400, {
      message:
        "invalid claims parameter: must be an object with optional `userinfo` and `id_token` members",
    });
  }
  // Drop empty top-level members so downstream code can rely on
  // `claims.userinfo` / `claims.id_token` being present-and-nonempty when set.
  const out: ClaimsRequest = {};
  if (result.data.userinfo && Object.keys(result.data.userinfo).length > 0) {
    out.userinfo = result.data.userinfo;
  }
  if (result.data.id_token && Object.keys(result.data.id_token).length > 0) {
    out.id_token = result.data.id_token;
  }
  return out.userinfo || out.id_token ? out : undefined;
}

// Content types we accept for a request_uri payload. RFC 9101 §6.2 specifies
// `application/oauth-authz-req+jwt`; `application/jwt` is the historical OIDC
// Core media type many clients still serve.
const REQUEST_URI_CONTENT_TYPES = new Set([
  "application/oauth-authz-req+jwt",
  "application/jwt",
]);

async function fetchRequestUri(
  rawUrl: string,
  ssrfOpts: SsrfFetchOptions,
): Promise<string> {
  const { status, body, contentType } = await ssrfSafeFetch(rawUrl, ssrfOpts);
  if (status !== 200) {
    throw new HTTPException(400, {
      message: `request_uri returned status ${status}`,
    });
  }
  // Strip parameters like ";charset=utf-8" before checking against allow-list.
  const ctype = (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (!REQUEST_URI_CONTENT_TYPES.has(ctype)) {
    throw new HTTPException(400, {
      message: `request_uri returned unsupported content-type: ${ctype || "(missing)"}`,
    });
  }
  const trimmed = body.trim();
  if (!trimmed || trimmed.split(".").length !== 3) {
    throw new HTTPException(400, {
      message: "request_uri did not return a JWT",
    });
  }
  return trimmed;
}
const getRoot = defineRoute({
  route: createRoute({
    tags: ["oauth"],
    method: "get",
    path: "/",
    request: {
      query: authorizeParamsSchema
        .extend({
          client_id: z.string(), // Required in query
          screen_hint: z
            .string()
            .openapi({
              example: "signup",
              description:
                'Optional hint for the screen to show, like "signup" or "login".',
            })
            .optional(),
          request: z
            .string()
            .openapi({
              description:
                "JWT containing authorization request parameters (OpenID Connect Core Section 6.1). MUST be signed; alg=none is rejected.",
            })
            .optional(),
          request_uri: z
            .string()
            .url()
            .openapi({
              description:
                "URL referencing a Request Object JWT (OpenID Connect Core Section 6.2). The URL is fetched with SSRF protection.",
            })
            .optional(),
        })
        .passthrough(),
    },
    responses: {
      200: {
        description:
          "Successful authorization response. This can be an HTML page (e.g., for silent authentication iframe or universal login page) or a JSON object containing tokens (e.g., for response_mode=web_message).",
        content: {
          "text/html": {
            schema: z.string().openapi({ example: "<html>...</html>" }),
          },
          "application/json": {
            schema: tokenResponseSchema,
          },
        },
      },
      302: {
        description:
          "Redirect to the client's redirect URI, an authentication page, or an external identity provider.",
        headers: z.object({
          Location: z.string().url(),
        }),
      },
      400: {
        description:
          "Bad Request. Invalid parameters or other client-side errors.",
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
      403: {
        description:
          "Forbidden. The request is not allowed (e.g., invalid origin).",
        content: {
          "application/json": {
            schema: z.object({
              message: z.string(),
            }),
          },
        },
      },
    },
  }),
  handler: async (ctx) => {
    const { env } = ctx;
    const queryParams = ctx.req.valid("query");

    // OIDC Core 6.1/6.2: a Request Object MAY be passed by value (`request`)
    // or by reference (`request_uri`), but never both.
    if (queryParams.request && queryParams.request_uri) {
      throw new HTTPException(400, {
        message: "request and request_uri are mutually exclusive",
      });
    }

    // SSRF guard scopes for request_uri/jwks_uri/CIMD fetches. In tests
    // private hosts (127.0.0.1, localhost) are allowed via the env override.
    const ssrfFetchOptions: SsrfFetchOptions = ssrfFetchOptionsFromEnv(env);

    // Explicit bundle prefetch: warms the (tenant_id, client_id) snapshot
    // so every downstream config read in this request — including the ones
    // inside getEnrichedClient's parallel batch — is served from one cache
    // key. Skip for CIMD clients (URL-based ids that resolve out-of-band).
    if (queryParams.client_id && !isCimdClientId(queryParams.client_id)) {
      // Best-effort: a transient failure here must not short-circuit the
      // real client/redirect validation below, which owns the proper error
      // contract for an unknown client. Mirrors the other prefetch call sites.
      await prefetchClientBundle(ctx, {
        client_id: queryParams.client_id,
      }).catch(() => {});
    }

    let requestObjectJwt: string | undefined = queryParams.request;
    if (queryParams.request_uri) {
      try {
        requestObjectJwt = await fetchRequestUri(
          queryParams.request_uri,
          ssrfFetchOptions,
        );
      } catch (e) {
        if (e instanceof SsrfBlockedError) {
          throw new HTTPException(400, {
            message: `request_uri rejected: ${e.message}`,
          });
        }
        throw e;
      }
    }

    let requestParams: z.infer<typeof authorizeParamsSchema> = {};
    let requestClient:
      | Awaited<ReturnType<typeof getEnrichedClient>>
      | undefined;
    if (requestObjectJwt) {
      if (!queryParams.client_id) {
        throw new HTTPException(400, {
          message: "client_id is required to verify a request object",
        });
      }
      requestClient = await getEnrichedClient(
        env,
        queryParams.client_id,
        isCimdClientId(queryParams.client_id) ? ctx.var.tenant_id : undefined,
        ssrfFetchOptions,
      );
      try {
        const payload = await verifyRequestObject(
          requestObjectJwt,
          requestClient,
          {
            issuer: getIssuer(env, ctx.var.custom_domain),
            fetch: ssrfFetchOptions,
          },
        );
        const parsed = authorizeParamsSchema.safeParse(payload);
        if (!parsed.success) {
          // RFC 9101 §6.1: a verified-but-malformed Request Object MUST be
          // rejected. Falling through to unsigned query params would let a
          // forged unsigned request slip past the signature gate.
          throw new HTTPException(400, {
            message: `invalid request object: ${parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; ")}`,
          });
        }
        requestParams = parsed.data;
      } catch (e) {
        if (e instanceof RequestObjectVerificationError) {
          throw new HTTPException(400, {
            message: `invalid request object (${e.code}): ${e.message}`,
          });
        }
        throw e;
      }
    }

    // RFC 9101 §6.1 / OIDC Core §6.1: parameters in the signed Request Object
    // take precedence over duplicate query-string values. If the same param
    // is present in both with differing values, reject — silently picking
    // either side is unsafe (an attacker who controls the query string could
    // override a signed redirect_uri).
    for (const key of Object.keys(requestParams) as Array<
      keyof typeof requestParams
    >) {
      const reqValue = requestParams[key];
      const qValue = (queryParams as Record<string, unknown>)[key];
      if (
        reqValue !== undefined &&
        qValue !== undefined &&
        reqValue !== qValue
      ) {
        throw new HTTPException(400, {
          message: `request object and query parameter "${key}" disagree`,
        });
      }
    }
    let {
      redirect_uri,
      scope,
      audience,
      nonce,
      response_type,
      response_mode,
      code_challenge,
      code_challenge_method,
      prompt,
      max_age,
      acr_values,
      login_hint,
      ui_locales,
      organization,
      claims: rawClaims,
    } = { ...queryParams, ...requestParams };
    const {
      client_id,
      vendor_id,
      state,
      connection,
      login_ticket,
      realm,
      auth0Client,
      screen_hint,
    } = { ...queryParams, ...requestParams };

    ctx.set("log", "authorize");

    // OIDC Core 5.5 — decode the `claims` request parameter once, here.
    // Throws HTTPException(400) on malformed JSON / shape; we want that
    // error to surface before any further processing.
    let parsedClaims: ClaimsRequest | undefined = parseClaimsParam(rawClaims);

    // Reuse the client we already fetched while verifying the request object
    // when client_id matches; otherwise fetch fresh.
    const isCimd = isCimdClientId(client_id);
    const client =
      requestClient && requestClient.client_id === client_id
        ? requestClient
        : await getEnrichedClient(
            env,
            client_id,
            isCimd ? ctx.var.tenant_id : undefined,
            ssrfFetchOptions,
          );
    ctx.set("client_id", client.client_id);
    setTenantId(ctx, client.tenant.id);

    // When a `state` param matches a non-terminal login session, hydrate
    // any params the caller omitted from the session's stored authParams.
    // This makes `/authorize?connection=X&state=Y` work for social-login
    // redirects from the universal-login widget, which only reconstructs
    // params it has on hand (Auth0 parity).
    //
    // The lookup result is also handed to connectionAuth below so the
    // connection flow doesn't fetch the same session a second time.
    let existingSession: LoginSession | null | undefined;
    if (state) {
      existingSession = await env.data.loginSessions.get(
        client.tenant.id,
        state,
      );
      if (
        existingSession &&
        existingSession.state !== LoginSessionState.COMPLETED &&
        existingSession.state !== LoginSessionState.FAILED &&
        existingSession.state !== LoginSessionState.EXPIRED
      ) {
        const stored = existingSession.authParams;
        redirect_uri = redirect_uri ?? stored.redirect_uri;
        scope = scope ?? stored.scope;
        audience = audience ?? stored.audience;
        nonce = nonce ?? stored.nonce;
        response_type = response_type ?? stored.response_type;
        response_mode = response_mode ?? stored.response_mode;
        code_challenge = code_challenge ?? stored.code_challenge;
        code_challenge_method =
          code_challenge_method ?? stored.code_challenge_method;
        prompt = prompt ?? stored.prompt;
        max_age = max_age ?? stored.max_age?.toString();
        acr_values = acr_values ?? stored.acr_values;
        login_hint = login_hint ?? stored.username;
        ui_locales = ui_locales ?? stored.ui_locales;
        organization = organization ?? stored.organization;
        // `claims` on the stored session is already a parsed
        // ClaimsRequest object — preserve it directly when the caller
        // didn't re-send `claims`.
        if (!parsedClaims && stored.claims) {
          parsedClaims = stored.claims;
        }
      }
    }

    // CIMD clients are public (no client_secret). Require PKCE with S256 for
    // any code flow so an intercepted authorization code cannot be replayed.
    if (
      isCimd &&
      response_type?.includes("code") &&
      (!code_challenge || code_challenge_method !== "S256")
    ) {
      throw new HTTPException(400, {
        message:
          "PKCE with code_challenge_method=S256 is required for Client ID Metadata Document clients",
      });
    }

    // Sanitize redirect_uri: only remove fragment per RFC 6749 section 3.1.2
    // Note: We preserve the URL exactly as received (including trailing slashes)
    // to ensure strict string comparison works at the token endpoint.
    // OAuth params (code, error, etc.) should be stripped only when redirecting back.
    let sanitizedRedirectUri: string | undefined = redirect_uri;
    if (typeof redirect_uri === "string") {
      // Only strip fragment, preserve everything else exactly as received
      sanitizedRedirectUri = redirect_uri.split("#")[0];
    }

    const origin = ctx.req.header("origin");
    if (origin && !verifyRequestOrigin(origin, client.web_origins || [])) {
      throw new HTTPException(403, {
        message: `Origin ${origin} not allowed`,
      });
    }

    // Validate required parameter: response_type (per OIDC Core 3.1.2.1)
    if (!response_type) {
      // If redirect_uri is valid AND registered for this client, deliver the
      // error back via the same response_mode the client requested (OIDC
      // Core 3.1.2.6): form_post errors POST to the redirect_uri, not GET.
      // If the redirect_uri is missing or unregistered, never redirect to
      // it — return a local 400 to avoid acting as an open redirect.
      const callbackAllowed =
        !!sanitizedRedirectUri &&
        isValidRedirectUrl(sanitizedRedirectUri, client.callbacks || [], {
          allowPathWildcards: true,
          allowSubDomainWildcards: true,
        });
      if (sanitizedRedirectUri && callbackAllowed) {
        const errorParams: Record<string, string> = {
          error: "invalid_request",
          error_description: "Missing required parameter: response_type",
        };
        if (state) errorParams.state = state;

        if (response_mode === AuthorizationResponseMode.FORM_POST) {
          return formPostResponse(
            sanitizedRedirectUri,
            errorParams,
            new Headers(),
          );
        }

        const redirectUrl = new URL(sanitizedRedirectUri);
        for (const [k, v] of Object.entries(errorParams)) {
          redirectUrl.searchParams.set(k, v);
        }
        return ctx.redirect(redirectUrl.toString());
      }
      // No redirect_uri or not registered for this client — throw locally.
      throw new HTTPException(400, {
        message: "Missing required parameter: response_type",
      });
    }

    // Stamp the tenant's default_audience onto the request when the client
    // didn't provide one — Auth0 parity: setting a tenant default_audience
    // is "equivalent to appending this audience to every authorization
    // request". Freezing the resolved value on the login_session makes
    // later default_audience changes only affect new /authorize requests.
    const authParams: AuthParams = {
      redirect_uri: sanitizedRedirectUri,
      scope,
      state,
      client_id,
      vendor_id,
      audience: audience ?? client.tenant.default_audience,
      nonce,
      prompt,
      response_type,
      response_mode,
      code_challenge,
      code_challenge_method,
      username: login_hint,
      ui_locales,
      organization,
      max_age: max_age ? parseInt(max_age, 10) : undefined,
      acr_values,
      claims: parsedClaims,
    };

    if (authParams.redirect_uri) {
      const validCallbacks = client.callbacks || [];
      if (ctx.var.host) {
        // Allow wildcard for the auth server
        validCallbacks.push(`${getIssuer(ctx.env, ctx.var.custom_domain)}/*`);
        validCallbacks.push(
          `${getUniversalLoginUrl(ctx.env, ctx.var.custom_domain)}/*`,
        );
      }

      if (
        !isValidRedirectUrl(authParams.redirect_uri, validCallbacks, {
          allowPathWildcards: true,
          allowSubDomainWildcards: true,
        })
      ) {
        throw new HTTPException(400, {
          message: `Invalid redirect URI - ${authParams.redirect_uri}`,
        });
      }
    }

    // OAuth 2.0 Multiple Response Type Encoding Practices: `query` must not
    // be used when the authorization response carries front-channel tokens.
    // Auth0 rejects the combination with unsupported_response_mode; we used
    // to silently coerce to fragment at redirect-build time. Every
    // response_type except pure `code` carries a token. The error itself is
    // token-free, so delivering it via the requested query channel is safe.
    if (
      response_mode === AuthorizationResponseMode.QUERY &&
      response_type !== AuthorizationResponseType.CODE
    ) {
      const errorDescription = `Invalid response_mode "query" for response_type "${response_type}"`;
      if (sanitizedRedirectUri) {
        const errorParams: Record<string, string> = {
          error: "unsupported_response_mode",
          error_description: errorDescription,
        };
        if (state) errorParams.state = state;

        const redirectUrl = new URL(sanitizedRedirectUri);
        for (const [k, v] of Object.entries(errorParams)) {
          redirectUrl.searchParams.set(k, v);
        }
        return ctx.redirect(redirectUrl.toString());
      }
      throw new HTTPException(400, { message: errorDescription });
    }

    // Auth0 parity: reject /authorize when the audience doesn't match a
    // registered resource server, so the user sees the error before the
    // login UI rather than after entering credentials. An undefined
    // audience is allowed — it produces a userinfo-only JWT downstream.
    // The `${iss}userinfo` sentinel is that same userinfo-only path made
    // explicit (e.g. via tenant default_audience), not a resource server,
    // so it must skip the check too.
    const userinfoAudience = `${getIssuer(ctx.env, ctx.var.custom_domain)}userinfo`;
    if (authParams.audience && authParams.audience !== userinfoAudience) {
      const { resource_servers } = await env.data.resourceServers.list(
        client.tenant.id,
      );
      const audienceMatches = resource_servers.some(
        (rs) => rs.identifier === authParams.audience,
      );
      if (!audienceMatches) {
        const errorParams: Record<string, string> = {
          error: "access_denied",
          error_description: `Service not found: ${authParams.audience}`,
        };
        if (state) errorParams.state = state;

        if (sanitizedRedirectUri) {
          if (response_mode === AuthorizationResponseMode.FORM_POST) {
            return formPostResponse(
              sanitizedRedirectUri,
              errorParams,
              new Headers(),
            );
          }
          const redirectUrl = new URL(sanitizedRedirectUri);
          for (const [k, v] of Object.entries(errorParams)) {
            redirectUrl.searchParams.set(k, v);
          }
          return ctx.redirect(redirectUrl.toString());
        }
        throw new HTTPException(403, {
          message: `Service not found: ${authParams.audience}`,
        });
      }
    }

    // Fetch the session from cookies
    // Users may have multiple cookies with the same name due to domain/path conflicts,
    // partitioned vs non-partitioned cookies, or browser quirks. Try all cookie values
    // to find a valid session for robustness.
    let validSession;
    const authCookies = getAllAuthCookies(
      client.tenant.id,
      ctx.req.header("cookie"),
    );

    for (const cookieValue of authCookies) {
      const session = await env.data.sessions.get(
        client.tenant.id,
        cookieValue,
      );
      if (session && !session.revoked_at) {
        validSession = session;
        break;
      }
    }

    // If SSO is disabled for this client, ignore any existing session
    if (client.sso_disabled) {
      validSession = undefined;
    }

    // Silent authentication with iframe
    if (prompt == "none") {
      if (!sanitizedRedirectUri || !state || !response_type) {
        throw new HTTPException(400, {
          message:
            "Missing required parameters for silent auth: redirect_uri, state, and response_type",
        });
      }
      return silentAuth({
        ctx,
        session: validSession || undefined,
        redirect_uri: sanitizedRedirectUri,
        state,
        response_type,
        response_mode,
        client,
        nonce,
        code_challenge_method,
        code_challenge,
        audience: authParams.audience,
        scope,
        organization,
        max_age: max_age ? parseInt(max_age, 10) : undefined,
      });
    }

    // If there's only one connection and it's a OIDC provider, we can redirect
    // to that provider directly. Database connections are excluded via
    // isDatabaseConnectionStrategy since their strategy field can be any of
    // the "auth0"/"auth2"/"Username-Password-Authentication" spellings.
    if (
      client.connections.length === 1 &&
      client.connections[0] &&
      !UI_STRATEGIES.includes(client.connections[0].strategy || "") &&
      !isDatabaseConnectionStrategy(client.connections[0].strategy)
    ) {
      return connectionAuth(
        ctx,
        client,
        client.connections[0].name,
        authParams,
        existingSession,
      );
    }

    // Connection auth flow
    if (connection && connection !== Strategy.EMAIL) {
      // connectionAuth returns Promise<Response>, which is fine directly.
      return connectionAuth(
        ctx,
        client,
        connection,
        authParams,
        existingSession,
      );
    } else if (login_ticket) {
      const ticketAuthResult = await ticketAuth(
        ctx,
        client.tenant.id,
        login_ticket,
        authParams,
        realm!,
      );

      if (ticketAuthResult instanceof Response) {
        return ticketAuthResult;
      } else {
        return ctx.json(ticketAuthResult);
      }
    }

    const universalAuthResult = await universalAuth({
      ctx,
      client,
      auth0Client,
      authParams,
      session: validSession || undefined,
      connection,
      login_hint,
      screen_hint,
    });

    if (universalAuthResult instanceof Response) {
      return universalAuthResult;
    } else {
      return ctx.json(universalAuthResult);
    }
  },
});

const getResume = defineRoute({
  route: createRoute({
    tags: ["oauth"],
    method: "get",
    path: "/resume",
    request: {
      query: z.object({
        state: z.string(),
      }),
    },
    responses: {
      302: {
        description:
          "Redirect to the client's redirect_uri (with cookie set), to a MFA/continuation UL screen, or to the original authorization host when the browser is on the wrong custom domain.",
        headers: z.object({
          Location: z.string().url(),
        }),
      },
      400: {
        description: "Login session is in PENDING, FAILED, or EXPIRED state.",
        content: {
          "application/json": {
            schema: z.object({ message: z.string() }),
          },
        },
      },
      403: {
        description: "Login session not found.",
        content: {
          "application/json": {
            schema: z.object({ message: z.string() }),
          },
        },
      },
      409: {
        description: "Login session has already been completed (replay).",
        content: {
          "application/json": {
            schema: z.object({ message: z.string() }),
          },
        },
      },
    },
  }),
  handler: async (ctx) => {
    const { state } = ctx.req.valid("query");
    return resumeLoginSession(ctx, state);
  },
});

export const authorizeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot, getResume] as const);
