import { HTTPException } from "hono/http-exception";
import bcryptjs from "bcryptjs";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { AuthParams, LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { logMessage } from "../../helpers/logging";
import {
  getPrimaryUserByProvider,
  getUserByProvider,
} from "../../helpers/users";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";
import { userIdGenerate } from "../../utils/user-id";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
} from "../../helpers/password-policy";
import { sendResetPassword, sendValidateEmailAddress } from "../../emails";
import { nanoid } from "nanoid";
import { stringifyAuth0Client } from "../../utils/client-info";
import { setTenantId } from "../../helpers/set-tenant-id";
import { getEnrichedClient } from "../../helpers/client";

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
                email: z.string().optional(),
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

      const client = await getEnrichedClient(ctx.env, client_id);
      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);

      // Find the password connection from the client's connections to get the correct password policy
      const passwordConnection = client.connections.find(
        (c) => c.strategy === "Username-Password-Authentication",
      );
      const connectionName =
        passwordConnection?.name || "Username-Password-Authentication";

      // Validate password against connection policy
      const policy = await getPasswordPolicy(
        ctx.env.data,
        client.tenant.id,
        connectionName,
      );

      try {
        await validatePasswordPolicy(policy, {
          tenantId: client.tenant.id,
          userId: "", // No user yet for signup
          newPassword: password,
          data: ctx.env.data,
        });
      } catch (policyError: any) {
        throw new HTTPException(400, {
          message:
            policyError?.message || "Password does not meet the requirements",
        });
      }

      const existingUser = await getPrimaryUserByProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        username: email,
        provider: "auth2",
      });

      if (existingUser) {
        // Auth0 doesn't inform that the user already exists
        throw new HTTPException(400, { message: "Invalid sign up" });
      }

      const newUser = await ctx.env.data.users.create(client.tenant.id, {
        user_id: `auth2|${userIdGenerate()}`,
        email,
        email_verified: false,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
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
        is_current: true,
      });

      await sendValidateEmailAddress(ctx, newUser);

      logMessage(ctx, client.tenant.id, {
        type: LogTypes.SUCCESS_SIGNUP,
        description: "Successful signup",
      });

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

      const client = await getEnrichedClient(ctx.env, client_id);
      ctx.set("client_id", client.client_id);
      setTenantId(ctx, client.tenant.id);

      const existingUser = await getUserByProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        username: email,
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

      const loginSession = await ctx.env.data.loginSessions.create(
        client.tenant.id,
        {
          expires_at: new Date(
            Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
          ).toISOString(),
          authParams,
          csrf_token: nanoid(),
          ip: ctx.get("ip"),
          useragent: ctx.get("useragent"),
          auth0Client: stringifyAuth0Client(ctx.get("auth0_client")),
        },
      );

      await sendResetPassword(
        ctx,
        email,
        loginSession.id,
        loginSession.authParams.state,
      );

      return ctx.html(
        "If an account with that email exists, we've sent instructions to reset your password.",
      );
    },
  );
