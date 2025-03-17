import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import EnterCodePage from "../../components/EnterCodePage";
import { getPrimaryUserByEmailAndProvider } from "../../helpers/users";
import { loginWithPasswordless } from "../../authentication-flows/passwordless";

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

      const { vendorSettings, loginSession, client } = await initJSXRoute(
        ctx,
        state,
      );

      if (!loginSession.authParams.username) {
        throw new HTTPException(400, {
          message: "Username not found in state",
        });
      }

      const passwordUser = await getPrimaryUserByEmailAndProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        email: loginSession.authParams.username,
        provider: "auth2",
      });

      return ctx.html(
        <EnterCodePage
          vendorSettings={vendorSettings}
          email={loginSession.authParams.username}
          state={state}
          client={client}
          hasPasswordLogin={!!passwordUser}
        />,
      );
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
        200: {
          description: "Response",
        },
      },
    }),
    async (ctx) => {
      const { state } = ctx.req.valid("query");
      const { code } = ctx.req.valid("form");

      const { loginSession, client, vendorSettings } = await initJSXRoute(
        ctx,
        state,
      );
      ctx.set("client_id", client.id);

      if (!loginSession.authParams.username) {
        throw new HTTPException(400, {
          message: "Username not found in state",
        });
      }

      try {
        return await loginWithPasswordless(
          ctx,
          client,
          loginSession.authParams,
          loginSession.authParams.username,
          code,
        );
      } catch (e) {
        const err = e as Error;

        const passwordUser = await getPrimaryUserByEmailAndProvider({
          userAdapter: ctx.env.data.users,
          tenant_id: client.tenant.id,
          email: loginSession.authParams.username,
          provider: "auth2",
        });

        return ctx.html(
          <EnterCodePage
            vendorSettings={vendorSettings}
            email={loginSession.authParams.username}
            state={state}
            client={client}
            error={err.message}
            hasPasswordLogin={!!passwordUser}
          />,
          400,
        );
      }
    },
  );
