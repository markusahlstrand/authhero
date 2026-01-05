import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import UnverifiedEmailPage from "../../components/UnverifiedEmailPage";
import EnterPasswordPage from "../../components/EnterPasswordPage";
import i18next from "i18next";
import { loginWithPassword } from "../../authentication-flows/password";
import { AuthError } from "../../types/AuthError";

export const enterPasswordRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/enter-password
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
      },
      responses: {
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");

      const { theme, branding, client, loginSession } =
        await initJSXRoute(ctx, state);

      if (!loginSession.authParams.username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      return ctx.html(
        <EnterPasswordPage
          theme={theme}
          branding={branding}
          email={loginSession.authParams.username}
          state={state}
          client={client}
        />,
      );
    },
  )
  // --------------------------------
  // POST /u/enter-password
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state parameter from the authorization request",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                password: z.string(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "HTML page indicating success or a next step (if not redirecting).",
          content: { "text/html": { schema: z.string() } },
        },
        302: {
          description:
            "Redirect to continue the authentication flow (e.g., to client, MFA, consent).",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML page with an error message (e.g., invalid password, username required).",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description:
            "Internal Server Error - HTML page with an error message.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const body = ctx.req.valid("form");
      const { password } = body;

      const { theme, branding, client, loginSession } =
        await initJSXRoute(ctx, state);

      const { username } = loginSession.authParams;

      if (!username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      try {
        const resultFromLogin = await loginWithPassword(
          ctx,
          client,
          {
            ...loginSession.authParams,
            password,
          },
          loginSession,
        );

        return resultFromLogin;
      } catch (err) {
        const customException = err as AuthError;

        if (
          customException.code === "INVALID_PASSWORD" ||
          customException.code === "USER_NOT_FOUND"
        ) {
          return ctx.html(
            <EnterPasswordPage
              theme={theme}
              branding={branding}
              email={username}
              error={i18next.t("invalid_password")}
              state={state}
              client={client}
            />,
            400,
          );
        } else if (customException.code === "EMAIL_NOT_VERIFIED") {
          return ctx.html(
            <UnverifiedEmailPage
              theme={theme}
              branding={branding}
              client={client}
              state={state}
            />,
            400,
          );
        }

        // Fallback for other AuthErrors or unexpected errors
        return ctx.html(
          <EnterPasswordPage
            theme={theme}
            branding={branding}
            email={username}
            error={customException.message || "An unknown error occurred."}
            state={state}
            client={client}
          />,
          customException.code ? 400 : 500, // 400 for known auth errors, 500 otherwise
        );
      }
    },
  );
