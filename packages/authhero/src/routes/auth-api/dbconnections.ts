import { HTTPException } from "hono/http-exception";
import bcryptjs from "bcryptjs";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AuthParams, LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { createLogMessage } from "../../utils/create-log-message";
import {
  getPrimaryUserByEmailAndProvider,
  getUserByEmailAndProvider,
} from "../../helpers/users";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { userIdGenerate } from "../../utils/user-id";
import validatePasswordStrength from "../../utils/password";
import { getClientInfo } from "../../utils/client-info";
import { sendResetPassword, sendValidateEmailAddress } from "../../emails";

export const dbConnectionRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // POST /dbconnections/signup
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["dbconnections"],
      method: "post",
      path: "/signup",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                client_id: z.string(),
                connection: z.literal("Username-Password-Authentication"),
                email: z.string().transform((u) => u.toLowerCase()),
                password: z.string(),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.object({
                _id: z.string(),
                email: z.string(),
                email_verified: z.boolean(),
                app_metadata: z.object({}),
                user_metadata: z.object({}),
              }),
            },
          },
          description: "Created user",
        },
      },
    }),
    async (ctx) => {
      const { email, password, client_id } = ctx.req.valid("json");

      const client = await ctx.env.data.clients.get(client_id);
      if (!client) {
        throw new HTTPException(400, {
          message: "Client not found",
        });
      }
      ctx.set("client_id", client.id);

      // auth0 returns a detailed JSON response with the way the password does match the strength rules
      if (!validatePasswordStrength(password)) {
        throw new HTTPException(400, {
          message: "Password does not meet the requirements",
        });
      }

      const existingUser = await getPrimaryUserByEmailAndProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        email,
        provider: "auth2",
      });

      if (existingUser) {
        // Auth0 doesn't inform that the user already exists
        throw new HTTPException(400, { message: "Invalid sign up" });
      }

      const newUser = await ctx.env.data.users.create(client.tenant.id, {
        user_id: `auth2|${userIdGenerate()}`,
        email,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        email_verified: false,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
        login_count: 0,
      });

      ctx.set("user_id", newUser.user_id);
      ctx.set("username", newUser.email);
      ctx.set("connection", newUser.connection);

      // Store the password
      const hashedPassword = await bcryptjs.hash(password, 10);
      await ctx.env.data.passwords.create(client.tenant.id, {
        user_id: newUser.user_id,
        password: hashedPassword,
        algorithm: "bcrypt",
      });

      await sendValidateEmailAddress(ctx, client.tenant.id, newUser);

      const log = createLogMessage(ctx, {
        type: LogTypes.SUCCESS_SIGNUP,
        description: "Successful signup",
      });
      await ctx.env.data.logs.create(client.tenant.id, log);

      return ctx.json({
        _id: newUser.user_id,
        email: newUser.email,
        email_verified: false,
        app_metadata: {},
        user_metadata: {},
      });
    },
  ) // --------------------------------
  // POST /dbconnections/change_password
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["dbconnections"],
      method: "post",
      path: "/change_password",
      request: {
        body: {
          content: {
            "application/json": {
              schema: z.object({
                client_id: z.string(),
                connection: z.literal("Username-Password-Authentication"),
                email: z.string().transform((u) => u.toLowerCase()),
              }),
            },
          },
        },
      },
      responses: {
        200: {
          description: "Redirect to the client's redirect uri",
        },
      },
    }),
    async (ctx) => {
      const { email, client_id } = ctx.req.valid("json");

      const client = await ctx.env.data.clients.get(client_id);
      if (!client) {
        throw new HTTPException(400, {
          message: "Client not found",
        });
      }

      const existingUser = await getUserByEmailAndProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        email,
        provider: "auth2",
      });

      if (!existingUser) {
        // To prevent account enumeration, respond with a generic message
        return ctx.html(
          "If an account with that email exists, we've sent instructions to reset your password.",
        );
      }

      const authParams: AuthParams = {
        client_id: client_id,
        username: email,
      };

      const loginSession = await ctx.env.data.logins.create(client.tenant.id, {
        expires_at: new Date(
          Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
        ).toISOString(),
        authParams,
        ...getClientInfo(ctx.req),
      });

      await sendResetPassword(
        ctx,
        client.tenant.id,
        email,
        loginSession.login_id,
        loginSession.authParams.state,
      );

      return ctx.html(
        "If an account with that email exists, we've sent instructions to reset your password.",
      );
    },
  );
