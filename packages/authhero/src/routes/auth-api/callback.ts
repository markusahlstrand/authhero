import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  LogTypes,
  Strategy,
  promptSettingSchema,
} from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { setSearchParams } from "../../utils/url";
import { Bindings, Variables } from "../../types";
import { connectionCallback } from "../../authentication-flows/connection";
import { logMessage } from "../../helpers/logging";
import { JSONHTTPException } from "../../errors/json-http-exception";

import { getEnrichedClient } from "../../helpers/client";
import { getIssuer } from "../../variables";

function redirectToErrorPage(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  error: string,
  errorDescription?: string,
) {
  const errorUrl = new URL(
    "/u/error",
    getIssuer(ctx.env, ctx.var.custom_domain),
  );
  setSearchParams(errorUrl, {
    error,
    error_description: errorDescription,
  });
  return ctx.redirect(errorUrl.toString());
}

async function returnError(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
  error: string,
  error_description?: string,
  error_code?: string,
  skipLog?: boolean,
) {
  const oauth2code = await ctx.env.data.codes.get(
    ctx.var.tenant_id || "",
    state,
    "oauth2_state",
  );
  if (!oauth2code) {
    return redirectToErrorPage(ctx, "state_not_found");
  }

  const loginSession = await ctx.env.data.loginSessions.get(
    ctx.var.tenant_id,
    oauth2code.login_id,
  );
  if (!loginSession) {
    return redirectToErrorPage(ctx, "session_not_found");
  }

  const { redirect_uri } = loginSession.authParams;
  if (!redirect_uri) {
    throw new HTTPException(400, { message: "Redirect uri not found" });
  }

  if (!skipLog) {
    logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.FAILED_LOGIN,
      description: `Failed connection login: ${error_code} ${error}, ${error_description}`,
    });
  }

  let routePrefix = "/u";
  let loginPath = "/login/identifier";
  if (loginSession.authParams.client_id) {
    try {
      const client = await getEnrichedClient(
        ctx.env,
        loginSession.authParams.client_id,
        ctx.var.tenant_id,
      );
      if (client?.client_metadata?.universal_login_version === "2") {
        routePrefix = "/u2";

        const promptSettings = await ctx.env.data.promptSettings.get(
          ctx.var.tenant_id,
        );
        const settings = promptSettingSchema.parse(promptSettings || {});
        const hasPasswordConnection = client.connections.some(
          (c) => c.strategy === Strategy.USERNAME_PASSWORD,
        );
        if (settings.identifier_first === false && hasPasswordConnection) {
          loginPath = "/login";
        }
      }
    } catch {
      // fall back to /u/login/identifier
    }
  }

  const loginUrl = new URL(
    `${routePrefix}${loginPath}`,
    getIssuer(ctx.env, ctx.var.custom_domain),
  );
  setSearchParams(loginUrl, {
    state: loginSession.id,
    error,
    error_description,
  });

  return ctx.redirect(loginUrl.toString());
}

/**
 * Extract a descriptive error message from any error thrown during the callback flow.
 */
function getErrorDescription(err: unknown): string {
  if (err instanceof Error) {
    // Arctic OAuth2RequestError (e.g. invalid_grant, redirect_uri_mismatch)
    if ("code" in err && "description" in err) {
      const oauthErr = err as Error & {
        code: string;
        description: string | null;
      };
      return oauthErr.description
        ? `${oauthErr.code}: ${oauthErr.description}`
        : oauthErr.code;
    }
    // Arctic UnexpectedResponseError / UnexpectedErrorResponseBodyError
    if ("status" in err) {
      const statusErr = err as Error & { status: number };
      return `${err.message} (status: ${statusErr.status})`;
    }
    return err.message;
  }
  return String(err);
}

/**
 * Shared handler for both GET and POST callback routes.
 */
async function handleCallback(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  params: {
    state: string;
    code?: string;
    error?: string;
    error_description?: string;
    error_code?: string;
  },
) {
  const { state, code, error, error_description, error_code } = params;

  if (error) {
    return returnError(ctx, state, error, error_description, error_code);
  }

  if (!code) {
    throw new HTTPException(400, { message: "Code is required" });
  }

  try {
    const result = await connectionCallback(ctx, {
      code,
      state,
    });

    if (!(result instanceof Response)) {
      throw new HTTPException(500, { message: "Internal server error" });
    }

    return result;
  } catch (err) {
    if (err instanceof JSONHTTPException) {
      // State/session not found - redirect to branded error page
      if (err.status === 403) {
        return redirectToErrorPage(ctx, "state_not_found");
      }
      // Handle JSONHTTPException with 400 status (e.g., signup disabled)
      // Redirect to identifier page for all social login flows
      if (err.status === 400) {
        const oauth2code = await ctx.env.data.codes.get(
          ctx.var.tenant_id || "",
          state,
          "oauth2_state",
        );
        if (oauth2code) {
          const loginSession = await ctx.env.data.loginSessions.get(
            ctx.var.tenant_id,
            oauth2code.login_id,
          );
          if (loginSession) {
            let errorMessage = "access_denied";
            let errorCode = "access_denied";
            try {
              const body = JSON.parse(err.message);
              errorMessage =
                body.error_description || body.message || errorMessage;
              errorCode = body.error || errorCode;
            } catch {
              // If message is not JSON, use it directly
              errorMessage = err.message || errorMessage;
            }
            return returnError(ctx, state, errorCode, errorMessage);
          }
        }
      }
    }

    // Let HTTPExceptions propagate to the global error handler
    if (err instanceof HTTPException) {
      throw err;
    }

    // Catch all other errors (arctic OAuth2RequestError, network errors,
    // JWT parsing errors, etc.) - log them and redirect to login with error
    const description = getErrorDescription(err);
    logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.FAILED_LOGIN,
      description: `Connection callback failed: ${description}`,
    });

    return returnError(
      ctx,
      state,
      "connection_error",
      "Connection failed",
      undefined,
      true,
    );
  }
}

export const callbackRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /callback
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["oauth2"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string(),
          code: z.string().optional(),
          scope: z.string().optional(),
          hd: z.string().optional(),
          error: z.string().optional(),
          error_description: z.string().optional(),
          error_code: z.string().optional(),
          error_reason: z.string().optional(),
        }),
      },
      responses: {
        302: {
          description: "Redirect to the client's redirect uri",
        },
        400: {
          description: "Bad Request",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string(),
              }),
            },
          },
        },
        500: {
          description: "Internal Server Error",
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
    async (ctx) => {
      return handleCallback(ctx, ctx.req.valid("query"));
    },
  )
  // --------------------------------
  // POST /callback
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
              schema: z.object({
                state: z.string(),
                code: z.string().optional(),
                scope: z.string().optional(),
                hd: z.string().optional(),
                error: z.string().optional(),
                error_description: z.string().optional(),
                error_code: z.string().optional(),
                error_reason: z.string().optional(),
              }),
            },
          },
        },
      },
      responses: {
        302: {
          description: "Redirect to the client's redirect uri",
        },
        400: {
          description: "Bad Request",
          content: {
            "application/json": {
              schema: z.object({
                message: z.string(),
              }),
            },
          },
        },
        500: {
          description: "Internal Server Error",
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
    async (ctx) => {
      return handleCallback(ctx, ctx.req.valid("form"));
    },
  );
