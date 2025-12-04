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
  roleListSchema,
  organizationSchema,
} from "@authhero/adapter-interfaces";

const usersWithTotalsSchema = totalsSchema.extend({
  users: z.array(auth0UserResponseSchema),
});

const sessionsWithTotalsSchema = totalsSchema.extend({
  sessions: z.array(sessionSchema),
});

const userOrganizationsWithTotalsSchema = totalsSchema.extend({
  organizations: z.array(organizationSchema),
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

      // ugly hardcoded switch for now!
      if (q?.includes("identities.profileData.email")) {
        // assuming no other query params here... could be stricter
        const linkedAccountEmail = q.split("=")[1];
        const results = await ctx.env.data.users.list(ctx.var.tenant_id, {
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
          ctx.var.tenant_id,
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

      const result = await ctx.env.data.users.list(ctx.var.tenant_id, {
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

      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);

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

      const result = await ctx.env.data.users.remove(
        ctx.var.tenant_id,
        user_id,
      );

      if (!result) {
        throw new HTTPException(404);
      }

      // Log the Management API operation
      const log = await createLogMessage(ctx, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Delete a User",
      });

      // Add response details to the log
      log.details = {
        ...log.details,
        response: {
          statusCode: 204,
          body: {},
        },
      };

      waitUntil(ctx, ctx.env.data.logs.create(ctx.var.tenant_id, log));

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
              schema: z.object({
                ...userInsertSchema.shape,
                password: z.string().optional(),
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
        password,
      } = body;

      // Parse user_id to avoid double-prefixing if client sends provider-prefixed id
      const rawUserId = body["user_id"];
      const idPart = rawUserId ? userIdParse(rawUserId) : userIdGenerate();
      const user_id = `${body.provider}|${idPart}`;

      try {
        // ctx.env.data is already wrapped with hooks by the management API middleware,
        // so we can use it directly to enable automatic account linking
        const userToCreate = {
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
        };

        // Create the user - this may trigger account linking
        const result = await ctx.env.data.users.create(
          ctx.var.tenant_id,
          userToCreate,
        );

        // Create password if provided
        // IMPORTANT: The password should be stored on the NEWLY CREATED user (user_id),
        // not on the returned user (result), because result may be the primary user
        // if automatic linking occurred
        if (password) {
          const passwordOptions: PasswordInsert = {
            user_id, // Use the original user_id, not result.user_id
            password: await bcryptjs.hash(password, 10),
            algorithm: "bcrypt",
            is_current: true,
          };
          await ctx.env.data.passwords.create(
            ctx.var.tenant_id,
            passwordOptions,
          );
        }

        ctx.set("user_id", result.user_id);

        const log = await createLogMessage(ctx, {
          type: LogTypes.SUCCESS_API_OPERATION,
          description: "User created",
        });
        waitUntil(ctx, ctx.env.data.logs.create(ctx.var.tenant_id, log));

        // Build response with identities
        // If linking occurred, result will be the primary user with identities populated
        const userResponse = result.identities
          ? result
          : {
              ...result,
              identities: [
                {
                  connection: result.connection,
                  provider: result.provider,
                  user_id: userIdParse(result.user_id),
                  isSocial: result.is_social,
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
      const body = ctx.req.valid("json");
      const { user_id } = ctx.req.valid("param");

      // verify_email is not persisted, connection is used to target a specific identity
      const { verify_email, password, connection, ...userFields } = body;
      const userToPatch = await data.users.get(ctx.var.tenant_id, user_id);

      if (!userToPatch) {
        throw new HTTPException(404);
      }

      if (userToPatch.linked_to) {
        throw new HTTPException(404, {
          // not the auth0 error message but I'd rather deviate here
          message: "User is linked to another user",
        });
      }

      // If a connection is specified, we need to find the user with that connection
      // This could be the primary user itself or a linked secondary user
      let targetUserId = user_id;
      let targetUser = userToPatch;

      if (connection) {
        // Check if the primary user has this connection
        if (userToPatch.connection === connection) {
          // Target is the primary user
          targetUserId = user_id;
          targetUser = userToPatch;
        } else {
          // Look for a linked user with this connection
          const linkedUsers = await data.users.list(ctx.var.tenant_id, {
            page: 0,
            per_page: 100,
            include_totals: false,
            q: `linked_to:${user_id}`,
          });

          const linkedUserWithConnection = linkedUsers.users.find(
            (u) => u.connection === connection,
          );

          if (!linkedUserWithConnection) {
            throw new HTTPException(404, {
              message: `No identity found with connection: ${connection}`,
            });
          }

          targetUserId = linkedUserWithConnection.user_id;
          targetUser = linkedUserWithConnection;
        }
      }

      // Check if the email is being changed to an existing email of another user
      if (userFields.email && userFields.email !== targetUser.email) {
        const existingUser = await getUsersByEmail(
          ctx.env.data.users,
          ctx.var.tenant_id,
          userFields.email,
        );

        // If there is an existing user with the same email address, and it is not the same user
        if (
          existingUser.length &&
          existingUser.some((u) => u.user_id !== targetUserId)
        ) {
          throw new HTTPException(409, {
            message: "Another user with the same email address already exists.",
          });
        }
      }

      await ctx.env.data.users.update(
        ctx.var.tenant_id,
        targetUserId,
        userFields,
      );

      if (password) {
        // When updating password with a connection specified, use that connection
        // Otherwise, look for Username-Password-Authentication in the primary user's identities
        let passwordIdentity;

        if (connection) {
          // If connection is specified and it's a password connection, use the target user
          if (connection === "Username-Password-Authentication") {
            passwordIdentity = {
              provider: targetUser.provider,
              user_id: userIdParse(targetUserId)!,
            };
          } else {
            throw new HTTPException(400, {
              message: `Cannot set password for connection: ${connection}`,
            });
          }
        } else {
          // Original behavior: find password identity in the primary user
          passwordIdentity = userToPatch.identities?.find(
            (i) => i.connection === "Username-Password-Authentication",
          );

          if (!passwordIdentity) {
            throw new HTTPException(400, {
              message: "User does not have a password identity",
            });
          }
        }

        const passwordOptions: PasswordInsert = {
          user_id: `${passwordIdentity.provider}|${passwordIdentity.user_id}`,
          password: await bcryptjs.hash(password, 10),
          algorithm: "bcrypt",
          is_current: true,
        };

        const existingPassword = await data.passwords.get(
          ctx.var.tenant_id,
          `${passwordIdentity.provider}|${passwordIdentity.user_id}`,
        );
        if (existingPassword) {
          await data.passwords.update(ctx.var.tenant_id, passwordOptions);
        } else {
          await data.passwords.create(ctx.var.tenant_id, passwordOptions);
        }
      }

      // Always return the primary user
      const patchedUser = await ctx.env.data.users.get(
        ctx.var.tenant_id,
        user_id,
      );

      if (!patchedUser) {
        // we should never reach here UNLESS there's some race condition where another service deletes the users after the update...
        throw new HTTPException(500);
      }

      // Log the user update operation
      const log = await createLogMessage(ctx, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "Update a User",
        body,
      });

      // Add response details to the log
      log.details = {
        ...log.details,
        response: {
          statusCode: 200,
          body: patchedUser,
        },
      };

      waitUntil(ctx, ctx.env.data.logs.create(ctx.var.tenant_id, log));

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
      const body = ctx.req.valid("json");
      const { user_id } = ctx.req.valid("param");

      const link_with = "link_with" in body ? body.link_with : body.user_id;

      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) {
        throw new HTTPException(400, {
          message: "Linking an inexistent identity is not allowed.",
        });
      }

      await ctx.env.data.users.update(ctx.var.tenant_id, link_with, {
        linked_to: user_id,
      });

      const linkedusers = await ctx.env.data.users.list(ctx.var.tenant_id, {
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
      const { user_id, provider, linked_user_id } = ctx.req.valid("param");

      await ctx.env.data.users.unlink(
        ctx.var.tenant_id,
        user_id,
        provider,
        linked_user_id,
      );

      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
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

      const sessions = await ctx.env.data.sessions.list(ctx.var.tenant_id, {
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

      const { page, per_page, sort, q } = ctx.req.valid("query");

      // Check if user exists first
      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, {
          message: "User not found",
        });
      }

      // Get permissions assigned to this user using the new adapter
      const permissions = await ctx.env.data.userPermissions.list(
        ctx.var.tenant_id,
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
      const { permissions } = ctx.req.valid("json");

      // Check if user exists first
      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, {
          message: "User not found",
        });
      }

      // Use the new user permissions adapter to create permissions
      for (const permission of permissions) {
        const success = await ctx.env.data.userPermissions.create(
          ctx.var.tenant_id,
          user_id,
          {
            user_id,
            resource_server_identifier: permission.resource_server_identifier,
            permission_name: permission.permission_name,
          },
        );

        if (!success) {
          throw new HTTPException(500, {
            message: "Failed to assign permissions to user",
          });
        }
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
      const { permissions } = ctx.req.valid("json");

      // Check if user exists first
      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, {
          message: "User not found",
        });
      }

      // Use the new user permissions adapter to remove permissions
      for (const permission of permissions) {
        const success = await ctx.env.data.userPermissions.remove(
          ctx.var.tenant_id,
          user_id,
          permission,
        );

        if (!success) {
          throw new HTTPException(500, {
            message: "Failed to remove permissions from user",
          });
        }
      }

      return ctx.json({ message: "Permissions removed successfully" });
    },
  )
  // --------------------------------
  // GET /api/v2/users/:user_id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/{user_id}/roles",
      request: {
        params: z.object({ user_id: z.string() }),
        headers: z.object({ "tenant-id": z.string() }),
      },
      security: [{ Bearer: ["auth:read"] }],
      responses: {
        200: {
          content: { "application/json": { schema: roleListSchema } },
          description: "User roles",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");

      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) throw new HTTPException(404, { message: "User not found" });

      const roles = await ctx.env.data.userRoles.list(
        ctx.var.tenant_id,
        user_id,
        undefined,
        "", // Global roles should have empty string organization_id
      );
      return ctx.json(roles);
    },
  )
  // --------------------------------
  // POST /api/v2/users/:user_id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "post",
      path: "/{user_id}/roles",
      request: {
        params: z.object({ user_id: z.string() }),
        headers: z.object({ "tenant-id": z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ roles: z.array(z.string()) }),
            },
          },
        },
      },
      security: [{ Bearer: ["auth:write"] }],
      responses: { 201: { description: "Roles assigned to user" } },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { roles } = ctx.req.valid("json");

      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) throw new HTTPException(404, { message: "User not found" });

      // Create roles one by one using the new API
      for (const roleId of roles) {
        const ok = await ctx.env.data.userRoles.create(
          ctx.var.tenant_id,
          user_id,
          roleId,
          "", // Global roles should have empty string organization_id
        );
        if (!ok) {
          throw new HTTPException(500, {
            message: "Failed to assign roles to user",
          });
        }
      }

      return ctx.json(
        { message: "Roles assigned successfully" },
        { status: 201 },
      );
    },
  )
  // --------------------------------
  // DELETE /api/v2/users/:user_id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "delete",
      path: "/{user_id}/roles",
      request: {
        params: z.object({ user_id: z.string() }),
        headers: z.object({ "tenant-id": z.string() }),
        body: {
          content: {
            "application/json": {
              schema: z.object({ roles: z.array(z.string()) }),
            },
          },
        },
      },
      security: [{ Bearer: ["auth:write"] }],
      responses: { 200: { description: "Roles removed from user" } },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { roles } = ctx.req.valid("json");

      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) throw new HTTPException(404, { message: "User not found" });

      // Remove roles one by one using the new API
      for (const roleId of roles) {
        const ok = await ctx.env.data.userRoles.remove(
          ctx.var.tenant_id,
          user_id,
          roleId,
          "", // Global roles should have empty string organization_id
        );
        if (!ok) {
          throw new HTTPException(500, {
            message: "Failed to remove roles from user",
          });
        }
      }

      return ctx.json({ message: "Roles removed successfully" });
    },
  )
  // --------------------------------
  // GET /api/v2/users/:user_id/organizations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "get",
      path: "/{user_id}/organizations",
      request: {
        params: z.object({
          user_id: z.string(),
        }),
        query: querySchema,
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [{ Bearer: ["auth:read"] }],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: z.union([
                userOrganizationsWithTotalsSchema,
                z.array(organizationSchema),
              ]),
            },
          },
          description: "List of user organizations",
        },
      },
    }),
    async (ctx) => {
      const { user_id } = ctx.req.valid("param");
      const { page, per_page, include_totals, sort } = ctx.req.valid("query");

      // First verify user exists
      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Get organizations for the user using the new method
      const result = await ctx.env.data.userOrganizations.listUserOrganizations(
        ctx.var.tenant_id,
        user_id,
        {
          page,
          per_page,
          sort: parseSort(sort),
        },
      );

      if (include_totals) {
        return ctx.json({
          organizations: result.organizations,
          start: result.start,
          limit: result.limit,
          length: result.length,
        });
      }

      return ctx.json(result.organizations);
    },
  )
  // --------------------------------
  // DELETE /api/v2/users/:user_id/organizations/:organization_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["users"],
      method: "delete",
      path: "/{user_id}/organizations/{organization_id}",
      request: {
        params: z.object({
          user_id: z.string(),
          organization_id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [{ Bearer: ["auth:write"] }],
      responses: {
        200: {
          description: "User removed from organization successfully",
        },
      },
    }),
    async (ctx) => {
      const { user_id, organization_id } = ctx.req.valid("param");

      // First verify user exists
      const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Find the membership to remove
      const userOrgs = await ctx.env.data.userOrganizations.list(
        ctx.var.tenant_id,
        {
          q: `user_id:${user_id}`,
          per_page: 100, // Should be enough for most cases
        },
      );

      const membershipToRemove = userOrgs.userOrganizations.find(
        (uo) => uo.organization_id === organization_id,
      );

      if (!membershipToRemove) {
        throw new HTTPException(404, {
          message: "User is not a member of this organization",
        });
      }

      await ctx.env.data.userOrganizations.remove(
        ctx.var.tenant_id,
        membershipToRemove.id,
      );

      return ctx.json({
        message: "User removed from organization successfully",
      });
    },
  );
