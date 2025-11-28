import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { setSearchParams } from "../../utils/url";
import { Bindings, Variables } from "../../types";
import { connectionCallback } from "../../authentication-flows/connection";
import { logMessage } from "../../helpers/logging";

import { getUniversalLoginUrl } from "../../variables";

async function returnError(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  state: string,
  error: string,
  error_description?: string,
  error_code?: string,
  error_reason?: string,
) {
  const oauth2code = await ctx.env.data.codes.get(
    ctx.var.tenant_id || "",
    state,
    "oauth2_state",
  );
  if (!oauth2code) {
    throw new HTTPException(400, { message: "State not found" });
  }

  const loginSession = await ctx.env.data.loginSessions.get(
    ctx.var.tenant_id,
    oauth2code.login_id,
  );
  if (!loginSession) {
    throw new HTTPException(400, { message: "Login not found" });
  }

  const { redirect_uri } = loginSession.authParams;
  if (!redirect_uri) {
    throw new HTTPException(400, { message: "Redirect uri not found" });
  }

  logMessage(ctx, ctx.var.tenant_id, {
    type: LogTypes.FAILED_LOGIN,
    description: `Failed connection login: ${error_code} ${error}, ${error_description}`,
  });

  const redirectUri = new URL(redirect_uri);
  setSearchParams(redirectUri, {
    error,
    error_description,
    error_reason,
    error_code,
    state: loginSession.authParams.state,
  });

  return ctx.redirect(
    `${getUniversalLoginUrl(ctx.env)}login/identifier?state=${loginSession.id}&error=${error}`,
  );
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
      const {
        state,
        code,
        error,
        error_description,
        error_code,
        error_reason,
      } = ctx.req.valid("query");
      if (error) {
        return returnError(
          ctx,
          state,
          error,
          error_description,
          error_code,
          error_reason,
        );
      }

      if (!code) {
        // This specific HTTPException will be handled by Hono's default error handler.
        throw new HTTPException(400, { message: "Code is required" });
      }

      const result = await connectionCallback(ctx, {
        code,
        state,
      });

      if (!(result instanceof Response)) {
        throw new HTTPException(500, { message: "Internal server error" });
      }

      return result;
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
      const {
        state,
        code,
        error,
        error_description,
        error_code,
        error_reason,
      } = ctx.req.valid("form");

      if (error) {
        return returnError(
          ctx,
          state,
          error,
          error_description,
          error_code,
          error_reason,
        );
      }
      if (!code) {
        throw new HTTPException(400, { message: "Code is required" });
      }

      const result = await connectionCallback(ctx, {
        code,
        state,
      });

      if (!(result instanceof Response)) {
        throw new HTTPException(500, { message: "Internal server error" });
      }

      return result;
    },
  );
