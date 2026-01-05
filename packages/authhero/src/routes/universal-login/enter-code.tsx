import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import EnterCodePage from "../../components/EnterCodePage";
import { getPrimaryUserByProvider } from "../../helpers/users";
import { passwordlessGrant } from "../../authentication-flows/passwordless";
import MessagePage from "../../components/MessagePage";
import i18next from "i18next";
import { HTTPException } from "hono/http-exception";
import { setCookie } from "hono/cookie";

type Auth0Client = {
  name: string;
  version: string;
};

const APP_CLIENT_IDS = ["Auth0.swift"];

export type SendType = "link" | "code";

export function getSendParamFromAuth0ClientHeader(
  auth0ClientHeader?: string,
): SendType {
  if (!auth0ClientHeader) return "link";

  const decodedAuth0Client = atob(auth0ClientHeader);

  const auth0Client = JSON.parse(decodedAuth0Client) as Auth0Client;

  const isAppClient = APP_CLIENT_IDS.includes(auth0Client.name);

  return isAppClient ? "code" : "link";
}

export const enterCodeRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/enter-code
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "get",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state",
          }),
          style: z.enum(["classic", "shadcn"]).optional().openapi({
            description: "UI style to use for the enter code page",
          }),
        }),
      },
      responses: {
        200: {
          description: "HTML page to enter verification code.",
          content: { "text/html": { schema: z.string() } },
        },
        400: {
          description:
            "Bad Request - HTML error page if username is missing in state.",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description: "Internal Server Error - HTML error page.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { state, style } = ctx.req.valid("query");
      let theme, branding, loginSession, client;

      // Set cookie if style is explicitly provided in query param
      if (style) {
        setCookie(ctx, "auth_ui_style", style, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365, // 1 year
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        });
      }

      try {
        ({ theme, branding, loginSession, client } =
          await initJSXRoute(ctx, state));

        if (!loginSession.authParams.username) {
          // Render an error page if username is not found
          return ctx.html(
            <MessagePage
              theme={theme}
              branding={branding} // branding might be partially initialized
              client={client}
              state={state}
              pageTitle={i18next.t("error_page_title") || "Error"}
              message={
                i18next.t("username_not_found_error") ||
                "Username not found in session."
              }
            />,
            400,
          );
        }

        const passwordUser = await getPrimaryUserByProvider({
          userAdapter: ctx.env.data.users,
          tenant_id: client.tenant.id,
          username: loginSession.authParams.username,
          provider: "auth2",
        });

        // Classic style
        return ctx.html(
          <EnterCodePage
            theme={theme}
            branding={branding}
            email={loginSession.authParams.username}
            state={state}
            client={client}
            hasPasswordLogin={!!passwordUser}
          />,
        );
      } catch (err: unknown) {
        console.error("Error in GET /u/enter-code:", err);
        // Fallback for branding if initJSXRoute failed
        if (!branding) {
          branding = null; // Use null as fallback for branding
        }
        if (!theme) {
          theme = null; // Use null as fallback for theme
        }
        if (!client) {
          client = null; // Use null as fallback for client
        }
        return ctx.html(
          <MessagePage
            theme={theme}
            branding={branding}
            client={client}
            state={state}
            pageTitle={i18next.t("error_page_title") || "Error"}
            message={
              i18next.t("unexpected_error_try_again") ||
              "An unexpected error occurred. Please try again."
            }
          />,
          500,
        );
      }
    },
  )
  // --------------------------------
  // POST /u/enter-code
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["login"],
      method: "post",
      path: "/",
      request: {
        query: z.object({
          state: z.string().openapi({
            description: "The state",
          }),
          style: z.enum(["classic", "shadcn"]).optional().openapi({
            description: "UI style to use for the enter code page",
          }),
        }),
        body: {
          content: {
            "application/x-www-form-urlencoded": {
              schema: z.object({
                code: z.string(),
              }),
            },
          },
        },
      },
      responses: {
        302: {
          description: "Redirect to continue authentication flow.",
          headers: z.object({ Location: z.string().url() }),
        },
        400: {
          description:
            "Bad Request - HTML page with an error message (e.g., invalid code, username missing).",
          content: { "text/html": { schema: z.string() } },
        },
        500: {
          description:
            "Internal Server Error - HTML error page for unexpected issues.",
          content: { "text/html": { schema: z.string() } },
        },
      },
    }),
    async (ctx) => {
      const { state, style } = ctx.req.valid("query");
      const { code } = ctx.req.valid("form");

      // Set cookie if style is explicitly provided in query param
      if (style) {
        setCookie(ctx, "auth_ui_style", style, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365, // 1 year
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        });
      }

      const { theme, branding, client, loginSession } =
        await initJSXRoute(ctx, state);

      if (!loginSession.authParams.username) {
        // Render an error page if username is not found
        throw new HTTPException(400, {
          message:
            i18next.t("username_not_found_error") ||
            "Username not found in session.",
        });
      }

      try {
        ctx.set("client_id", client.client_id);

        const result = await passwordlessGrant(ctx, {
          client_id: client.client_id,
          authParams: loginSession.authParams,
          username: loginSession.authParams.username,
          otp: code,
        });

        if (result instanceof Response) {
          return result;
        } else {
          throw new HTTPException(500, {
            message:
              i18next.t("unexpected_error_try_again") ||
              "An unexpected error occurred. Please try again.",
          });
        }
      } catch (e: unknown) {
        let passwordUser;
        try {
          passwordUser = await getPrimaryUserByProvider({
            userAdapter: ctx.env.data.users,
            tenant_id: client.tenant.id,
            username: loginSession.authParams.username,
            provider: "auth2",
          });
        } catch {
          passwordUser = null;
        }

        // Classic style
        return ctx.html(
          <EnterCodePage
            theme={theme}
            branding={branding}
            email={loginSession.authParams?.username}
            state={state}
            client={client}
            error={(e as Error).message}
            hasPasswordLogin={!!passwordUser}
          />,
          400,
        );
      }
    },
  );
