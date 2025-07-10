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

      const { vendorSettings, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

      if (!loginSession.authParams.username) {
        throw new HTTPException(400, { message: "Username required" });
      }

      return ctx.html(
        <EnterPasswordPage
          vendorSettings={vendorSettings}
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

      const { vendorSettings, client, loginSession } = await initJSXRoute(
        ctx,
        state,
      );

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

        if (resultFromLogin instanceof Response) {
          return resultFromLogin; // Handles redirects, or HTML responses from loginWithPassword
        } else {
          // This branch handles an unexpected TokenResponse.
          // Log it and show an error page, as this route should not return JSON.
          console.error(
            "Unexpected TokenResponse in POST /u/enter-password. This might indicate a flow misconfiguration as this route expects HTML or redirect.",
            resultFromLogin,
          );
          return ctx.html(
            <EnterPasswordPage
              vendorSettings={vendorSettings}
              email={username}
              error={"An unexpected error occurred. Please try again."} // Generic error
              state={state}
              client={client}
            />,
            500, // Internal Server Error status
          );
        }
      } catch (err) {
        const customException = err as AuthError;

        if (
          customException.code === "INVALID_PASSWORD" ||
          customException.code === "USER_NOT_FOUND"
        ) {
          return ctx.html(
            <EnterPasswordPage
              vendorSettings={vendorSettings}
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
              vendorSettings={vendorSettings}
              state={state}
            />,
            400,
          );
        }

        // Fallback for other AuthErrors or unexpected errors
        return ctx.html(
          <EnterPasswordPage
            vendorSettings={vendorSettings}
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
