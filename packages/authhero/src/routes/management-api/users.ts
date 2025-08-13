import { HTTPException } from "hono/http-exception";
import bcryptjs from "bcryptjs";
import { userIdGenerate, userIdParse } from "../../utils/user-id";
import { Bindings, Variables } from "../../types";
import { getUsersByEmail } from "../../helpers/users";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { createLogMessage } from "../../utils/create-log-message";
import { waitUntil } from "../../helpers/wait-until";
import {
  LogTypes,
  PasswordInsert,
  auth0UserResponseSchema,
  sessionSchema,
  totalsSchema,
  userInsertSchema,
  userPermissionWithDetailsListSchema,
} from "@authhero/adapter-interfaces";

const usersWithTotalsSchema = totalsSchema.extend({
  users: z.array(auth0UserResponseSchema),
});

const sessionsWithTotalsSchema = totalsSchema.extend({
  sessions: z.array(sessionSchema),
});

export const userRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/users
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/",
      request: {
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },

      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([
                z.array(auth0UserResponseSchema),
                usersWithTotalsSchema,
              ]),
            },
          },
          description: "List of users",
        },
      },
    }),
    async (ctx) => {
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      // ugly hardcoded switch for now!
      if (q?.includes("identities.profileData.email")) {
        // assuming no other query params here... could be stricter
        const linkedAccountEmail = q.split("=")[1];
        const results = await ctx.env.data.users.list(tenant_id, {
          page,
          per_page,
          include_totals,
          q: `email:${linkedAccountEmail}`,
        });

        // we want to ignore unlinked accounts
        const linkedAccounts = results.users.filter((u) => u.linked_to);

        // Assuming there is only one result here. Not very defensive programming!
        const [linkedAccount] = linkedAccounts;
        if (!linkedAccount) {
          return ctx.json([]);
        }

        // get primary account
        const primaryAccount = await ctx.env.data.users.get(
          tenant_id,
          // we know linked_to is truthy here but typescript cannot read .filter() logic above
          // possible to fix!
          linkedAccount.linked_to!,
        );

        if (!primaryAccount) {
          throw new HTTPException(500, {
            message: "Primary account not found",
          });
        }

        return ctx.json([auth0UserResponseSchema.parse(primaryAccount)]);
      }

      // Filter out linked users
      const query: string[] = ["-_exists_:linked_to"];
      if (q) {
        query.push(q);
      }

      const result = await ctx.env.data.users.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q: query.join(" "),
      });

      const primarySqlUsers = result.users.filter((user) => !user.linked_to);

      if (include_totals) {
        return ctx.json(
          usersWithTotalsSchema.parse({
            users: primarySqlUsers,
            length: result.length,
            start: result.start,
            limit: result.limit,
          }),
        );
      }

      return ctx.json(z.array(auth0UserResponseSchema).parse(primarySqlUsers));
    },
  )
  // --------------------------------
  // GET /users/:user_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/{user_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          user_id: z.string(),
        }),
      },

      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: auth0UserResponseSchema,
            },
          },
          description: "List of users",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const user = await ctx.env.data.users.get(tenant_id, user_id);

      if (!user) {
        throw new HTTPException(404);
      }

      if (user.linked_to) {
        throw new HTTPException(404, {
          message: "User is linked to another user",
        });
      }

      return ctx.json(user);
    },
  )
  // --------------------------------
  // DELETE /users/:user_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "delete",
      path: "/{user_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          user_id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const result = await ctx.env.data.users.remove(tenant_id, user_id);

      if (!result) {
        throw new HTTPException(404);
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // POST /users
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ ...userInsertSchema.shape }),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: auth0UserResponseSchema,
            },
          },
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");
      ctx.set("body", body);

      // As for instance verify_email is not persisted, we need to remove it from the body
      const {
        email,
        phone_number,
        name,
        linked_to,
        email_verified,
        provider,
        connection,
      } = body;

      const user_id = `${body.provider}|${body["user_id"] || userIdGenerate()}`;

      try {
        // This bypasses the hooks right now. Should we pass some flag so that the hooks may be bypassed?
        const data = await ctx.env.data.users.create(tenant_id, {
          email,
          user_id,
          name: name || email || phone_number,
          phone_number,
          provider,
          connection,
          linked_to: linked_to ?? undefined,
          email_verified: email_verified || false,
          last_ip: "",
          is_social: false,
          last_login: new Date().toISOString(),
        });

        ctx.set("user_id", data.user_id);

        const log = createLogMessage(ctx, {
          type: LogTypes.SUCCESS_API_OPERATION,
          description: "User created",
        });
        waitUntil(ctx, ctx.env.data.logs.create(tenant_id, log));

        const userResponse = {
          ...data,
          identities: [
            {
              connection: data.connection,
              provider: data.provider,
              user_id: userIdParse(data.user_id),
              isSocial: data.is_social,
            },
          ],
        };

        return ctx.json(auth0UserResponseSchema.parse(userResponse), {
          status: 201,
        });
      } catch (err: any) {
        if (err.message === "User already exists") {
          throw new HTTPException(409, {
            message: "User already exists",
          });
        }
        throw err;
      }
    },
  )
  // --------------------------------
  // PATCH /users/:user_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "patch",
      path: "/{user_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z
                .object({
                  ...userInsertSchema.shape,
                  verify_email: z.boolean(),
                  password: z.string(),
                })
                .partial(),
            },
          },
        },
        params: z.object({
          user_id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { data } = ctx.env;
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");
      const { user_id } = ctx.req.valid("param");

      // verify_email is not persisted
      const { verify_email, password, ...userFields } = body;
      const userToPatch = await data.users.get(tenant_id, user_id);

      if (!userToPatch) {
        throw new HTTPException(404);
      }

      // Check if the email is being changed to an existing email of another user
      if (userFields.email && userFields.email !== userToPatch.email) {
        const existingUser = await getUsersByEmail(
          ctx.env.data.users,
          tenant_id,
          userFields.email,
        );

        // If there is an existing user with the same email address, and it is not the same user
        if (
          existingUser.length &&
          existingUser.some((u) => u.user_id !== user_id)
        ) {
          throw new HTTPException(409, {
            message: "Another user with the same email address already exists.",
          });
        }
      }

      if (userToPatch.linked_to) {
        throw new HTTPException(404, {
          // not the auth0 error message but I'd rather deviate here
          message: "User is linked to another user",
        });
      }

      await ctx.env.data.users.update(tenant_id, user_id, userFields);

      if (password) {
        const passwordUser = userToPatch.identities?.find(
          (i) => i.connection === "Username-Password-Authentication",
        );

        if (!passwordUser) {
          throw new HTTPException(400, {
            message: "User does not have a password identity",
          });
        }

        const passwordOptions: PasswordInsert = {
          user_id: passwordUser.user_id,
          password: await bcryptjs.hash(password, 10),
          algorithm: "bcrypt",
        };

        const existingPassword = await data.passwords.get(
          tenant_id,
          passwordUser.user_id,
        );
        if (existingPassword) {
          await data.passwords.update(tenant_id, passwordOptions);
        } else {
          await data.passwords.create(tenant_id, passwordOptions);
        }
      }

      const patchedUser = await ctx.env.data.users.get(tenant_id, user_id);

      if (!patchedUser) {
        // we should never reach here UNLESS there's some race condition where another service deletes the users after the update...
        throw new HTTPException(500);
      }

      return ctx.json(patchedUser);
    },
  )
  // --------------------------------
  // POST /users/:user_id/identities
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "post",
      path: "/{user_id}/identities",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.union([
                z.object({ link_with: z.string() }),
                z.object({
                  user_id: z.string(),
                  provider: z.string(),
                  connection: z.string().optional(),
                }),
              ]),
            },
          },
        },
        params: z.object({
          user_id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          content: {
            "application/json": {
              schema: z.array(
                z.object({
                  connection: z.string(),
                  provider: z.string(),
                  user_id: z.string(),
                  isSocial: z.boolean(),
                }),
              ),
            },
          },
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");
      const { user_id } = ctx.req.valid("param");

      const link_with = "link_with" in body ? body.link_with : body.user_id;

      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(400, {
          message: "Linking an inexistent identity is not allowed.",
        });
      }

      await ctx.env.data.users.update(tenant_id, link_with, {
        linked_to: user_id,
      });

      const linkedusers = await ctx.env.data.users.list(tenant_id, {
        page: 0,
        per_page: 10,
        include_totals: false,
        q: `linked_to:${user_id}`,
      });

      const identities = [user, ...linkedusers.users].map((u) => ({
        connection: u.connection,
        provider: u.provider,
        user_id: userIdParse(u.user_id)!,
        isSocial: u.is_social,
      }));

      return ctx.json(identities, { status: 201 });
    },
  )
  // --------------------------------
  // DELETE /api/v2/users/{user_id}/identities/{provider}/{linked_user_id}
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "delete",
      path: "/{user_id}/identities/{provider}/{linked_user_id}",
      request: {
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          user_id: z.string(),
          provider: z.string(),
          linked_user_id: z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.array(auth0UserResponseSchema),
            },
          },
          description: "Status",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { user_id, provider, linked_user_id } = ctx.req.valid("param");

      await ctx.env.data.users.unlink(
        tenant_id,
        user_id,
        provider,
        linked_user_id,
      );

      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404);
      }

      return ctx.json([auth0UserResponseSchema.parse(user)]);
    },
  ) // --------------------------------
  // GET /users/:user_id/sessions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/{user_id}/sessions",
      request: {
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string(),
        }),
        params: z.object({
          user_id: z.string(),
        }),
      },

      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([
                z.array(sessionSchema),
                sessionsWithTotalsSchema,
              ]),
            },
          },
          description: "List of sessions",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { include_totals, page, per_page } = ctx.req.valid("query");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const sessions = await ctx.env.data.sessions.list(tenant_id, {
        page,
        per_page,
        include_totals,
        q: `user_id:${user_id}`,
      });

      if (!include_totals) {
        return ctx.json(sessions.sessions);
      }

      return ctx.json(sessions);
    },
  )
  // --------------------------------
  // GET /api/v2/users/:user_id/permissions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/{user_id}/permissions",
      request: {
        params: z.object({
          user_id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        query: querySchema,
      },
      security: [
        {
          Bearer: ["auth:read"],
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: userPermissionWithDetailsListSchema,
            },
          },
          description: "User permissions",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");

      const { page, per_page, sort, q } = ctx.req.valid("query");

      // Check if user exists first
      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, {
          message: "User not found",
        });
      }

      // Get permissions assigned to this user using the new adapter
      const permissions = await ctx.env.data.userPermissions.list(
        tenant_id,
        user_id,
        {
          page,
          per_page,
          include_totals: false,
          sort: parseSort(sort),
          q,
        },
      );

      return ctx.json(permissions);
    },
  )
  // --------------------------------
  // POST /api/v2/users/:user_id/permissions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "post",
      path: "/{user_id}/permissions",
      request: {
        params: z.object({
          user_id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                permissions: z.array(
                  z.object({
                    permission_name: z.string(),
                    resource_server_identifier: z.string(),
                  }),
                ),
              }),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        201: {
          description: "Permissions assigned to user",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { permissions } = ctx.req.valid("json");

      // Check if user exists first
      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, {
          message: "User not found",
        });
      }

      // Use the new user permissions adapter to assign permissions
      const success = await ctx.env.data.userPermissions.assign(
        tenant_id,
        user_id,
        permissions.map((p) => ({
          user_id,
          resource_server_identifier: p.resource_server_identifier,
          permission_name: p.permission_name,
        })),
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to assign permissions to user",
        });
      }

      return ctx.json(
        { message: "Permissions assigned successfully" },
        { status: 201 },
      );
    },
  )
  // --------------------------------
  // DELETE /api/v2/users/:user_id/permissions
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "delete",
      path: "/{user_id}/permissions",
      request: {
        params: z.object({
          user_id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                permissions: z.array(
                  z.object({
                    permission_name: z.string(),
                    resource_server_identifier: z.string(),
                  }),
                ),
              }),
            },
          },
        },
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Permissions removed from user",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { permissions } = ctx.req.valid("json");

      // Check if user exists first
      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, {
          message: "User not found",
        });
      }

      // Use the new user permissions adapter to remove permissions
      const success = await ctx.env.data.userPermissions.remove(
        tenant_id,
        user_id,
        permissions,
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to remove permissions from user",
        });
      }

      return ctx.json({ message: "Permissions removed successfully" });
    },
  );
