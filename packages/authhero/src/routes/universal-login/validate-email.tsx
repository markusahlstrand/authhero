import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import { HTTPException } from "hono/http-exception";
import { getUserByProvider, getUsersByEmail } from "../../helpers/users";
import EmailValidatedPage from "../../components/EmailValidatedPage";

export const validateEmailRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u/validate-email
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
          code: z.string().openapi({
            description: "The code parameter from the authorization request",
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
      const { state, code } = ctx.req.valid("query");

      const { env } = ctx;

      const { client, loginSession, theme, branding } = await initJSXRoute(
        ctx,
        state,
      );

      const { username } = loginSession.authParams;
      if (!username) {
        throw new HTTPException(400, {
          message: "Username not found in state",
        });
      }

      const user = await getUserByProvider({
        userAdapter: env.data.users,
        tenant_id: client.tenant.id,
        username: username,
        provider: "auth2",
      });
      if (!user) {
        throw new HTTPException(500, { message: "No user found" });
      }

      const foundCode = await env.data.codes.get(
        client.tenant.id,
        code,
        "email_verification",
      );

      if (!foundCode) {
        throw new HTTPException(400, { message: "Code not found or expired" });
      }

      await env.data.users.update(client.tenant.id, user.user_id, {
        email_verified: true,
      });

      const usersWithSameEmail = await getUsersByEmail(
        env.data.users,
        client.tenant.id,
        username,
      );

      const usersWithSameEmailButNotUsernamePassword =
        usersWithSameEmail.filter((user) => user.provider !== "auth2");

      if (usersWithSameEmailButNotUsernamePassword.length > 0) {
        const primaryUsers = usersWithSameEmailButNotUsernamePassword.filter(
          (user) => !user.linked_to,
        );

        // these cases are currently not handled! if we think they're edge cases and we release this, we should at least inform datadog!
        if (primaryUsers.length > 1) {
          console.error("More than one primary user found for email", username);
        }

        if (primaryUsers.length === 0) {
          console.error("No primary user found for email", username);
          // so here we should ... hope there is only one usersWithSameEmailButNotUsernamePassword
          // and then follow that linked_to chain?
        }

        // now actually link this username-password user to the primary user
        if (primaryUsers.length === 1) {
          await env.data.users.update(client.tenant.id, user.user_id, {
            linked_to: primaryUsers[0]?.user_id,
          });
        }
      }

      return ctx.html(
        <EmailValidatedPage theme={theme} branding={branding} state={state} />,
      );
    },
  );
