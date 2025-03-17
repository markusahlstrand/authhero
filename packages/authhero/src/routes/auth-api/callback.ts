import { HTTPException } from "hono/http-exception";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { LogTypes } from "@authhero/adapter-interfaces";
import { Context } from "hono";
import { setSearchParams } from "../../utils/url";
import { Bindings, Variables } from "../../types";
import { connectionCallback } from "../../authentication-flows/connection";
import { createLogMessage } from "../../utils/create-log-message";
import { waitUntil } from "../../helpers/wait-until";
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

  const log = createLogMessage(ctx, {
    type: LogTypes.FAILED_LOGIN,
    description: `Failed connection login: ${error_code} ${error}, ${error_description}`,
  });
  waitUntil(ctx, ctx.env.data.logs.create(ctx.var.tenant_id, log));

  const redirectUri = new URL(redirect_uri);
  setSearchParams(redirectUri, {
    error,
    error_description,
    error_reason,
    error_code,
    state: loginSession.authParams.state,
  });

  return ctx.redirect(
    `${getUniversalLoginUrl(ctx.env)}enter-email?state=${loginSession.id}&error=${error}`,
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
        // The code is not present if there's an error, so this will not be reached
        throw new HTTPException(400, { message: "Code is required" });
      }

      return connectionCallback(ctx, {
        code,
        state,
      });
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
        // The code is not present if there's an error, so this will not be reached
        throw new HTTPException(400, { message: "Code is required" });
      }

      return connectionCallback(ctx, {
        code,
        state,
      });
    },
  );
