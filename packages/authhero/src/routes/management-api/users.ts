import { HTTPException } from "hono/http-exception";
import { userIdGenerate, userIdParse } from "../../utils/user-id";
import { Bindings, Variables } from "../../types";
import { getUsersByEmail } from "../../helpers/users";
import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";
import { logMessage } from "../../helpers/logging";
import { hashPassword } from "../../helpers/password-policy";
import {
  Identity,
  LogTypes,
  Strategy,
  auth0UserResponseSchema,
  identitySchema,
  logSchema,
  sessionSchema,
  totalsSchema,
  userInsertSchema,
  userPermissionWithDetailsListSchema,
  roleListSchema,
  organizationSchema,
} from "@authhero/adapter-interfaces";
import { getProviderFromConnection } from "../../strategies";
import {
  isDatabaseConnectionStrategy,
  isUsernamePasswordProvider,
  resolveUsernamePasswordProvider,
} from "../../utils/username-password-provider";
import { getIssuer } from "../../variables";
import { withDefaultPicture } from "../../helpers/avatar";

import { defineRoute } from "../../utils/define-route";
const IDENTITY_PICK_KEYS = [
  "email",
  "email_verified",
  "phone_number",
  "phone_verified",
  "username",
] as const;

function pickIdentity(user: Record<string, any>): Identity {
  const identity: Identity = {
    connection: user.connection,
    provider: user.provider,
    user_id: userIdParse(user.user_id)!,
    isSocial: user.is_social,
  };

  for (const key of IDENTITY_PICK_KEYS) {
    if (user[key] !== undefined && user[key] !== null) {
      identity[key] = user[key];
    }
  }

  return identity;
}

const usersWithTotalsSchema = totalsSchema.extend({
  users: z.array(auth0UserResponseSchema),
});

// Checkpoint (keyset) pagination response: items plus an opaque cursor.
const usersWithNextSchema = z.object({
  users: z.array(auth0UserResponseSchema),
  next: z.string().optional().openapi({
    description: "Opaque cursor for the next page; absent on the last page.",
  }),
});

const sessionsWithTotalsSchema = totalsSchema.extend({
  sessions: z.array(sessionSchema),
});

const logsWithTotalsSchema = totalsSchema.extend({
  logs: z.array(logSchema),
});

const userOrganizationsWithTotalsSchema = totalsSchema.extend({
  organizations: z.array(organizationSchema),
});

// Slim projection of a Client suitable for end-user "connected apps" UIs.
// Excludes secrets and internal config; surfaces enough for revocation
// and display.
const connectedClientSchema = z.object({
  client_id: z.string(),
  name: z.string(),
  logo_uri: z.string().optional(),
  registration_type: z.enum(["manual", "open_dcr", "iat_dcr"]).optional(),
  registration_metadata: z.record(z.string(), z.any()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const connectedClientsWithTotalsSchema = totalsSchema.extend({
  connected_clients: z.array(connectedClientSchema),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/",
    request: {
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },

    security: [
      {
        Bearer: ["read:users", "auth:read"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([
              z.array(auth0UserResponseSchema),
              usersWithTotalsSchema,
              usersWithNextSchema,
            ]),
          },
        },
        description: "List of users",
      },
    },
  }),
  handler: async (ctx) => {
    const { page, per_page, include_totals, sort, q, from, take } =
      ctx.req.valid("query");
    const issuer = getIssuer(ctx.env, ctx.var.custom_domain);

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

      return ctx.json([
        auth0UserResponseSchema.parse(
          withDefaultPicture(primaryAccount, issuer),
        ),
      ]);
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
      from,
      take,
    });

    const primarySqlUsers = result.users
      .filter((user) => !user.linked_to)
      .map((user) => withDefaultPicture(user, issuer));

    // Keyset (checkpoint) pagination: return the { items, next } shape so
    // callers can page past the first page via the opaque cursor. A superset
    // of Auth0, which only offers offset (capped at 1000 results) on /users.
    if (from !== undefined || take !== undefined) {
      return ctx.json(
        usersWithNextSchema.parse({
          users: primarySqlUsers,
          next: result.next,
        }),
      );
    }

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
});

const getByUser_id = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        user_id: z.string(),
      }),
    },

    security: [
      {
        Bearer: ["read:users", "auth:read"],
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
  handler: async (ctx) => {
    const { user_id } = ctx.req.valid("param");

    const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);

    if (!user) {
      throw new HTTPException(404);
    }

    if (user.linked_to) {
      if (ctx.var.prefer?.has("include-linked")) {
        ctx.var.prefer.applied("include-linked");
      } else {
        throw new HTTPException(404, {
          message: "User is linked to another user",
        });
      }
    }

    return ctx.json(
      auth0UserResponseSchema.parse(
        withDefaultPicture(user, getIssuer(ctx.env, ctx.var.custom_domain)),
      ),
    );
  },
});

const deleteByUser_id = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "delete",
    path: "/{user_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        user_id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["delete:users", "auth:write"],
      },
    ],
    responses: {
      204: {
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
    const { user_id } = ctx.req.valid("param");

    const userToDelete = await ctx.env.data.users.get(
      ctx.var.tenant_id,
      user_id,
    );

    const result = await ctx.env.data.users.remove(ctx.var.tenant_id, user_id);

    if (!result) {
      throw new HTTPException(404);
    }

    // Log the Management API operation
    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Delete a User",
      beforeState: userToDelete ?? undefined,
      targetType: "user",
      targetId: user_id,
      response: {
        statusCode: 204,
        body: {},
      },
    });

    return ctx.body(null, 204);
  },
});

const postRoot = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "post",
    path: "/",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: userInsertSchema.extend({
              password: z.string().optional(),
            }),
          },
        },
      },
    },
    security: [
      {
        Bearer: ["create:users", "auth:write"],
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
  handler: async (ctx) => {
    const body = ctx.req.valid("json");
    ctx.set("body", body);

    // As for instance verify_email is not persisted, we need to remove it from the body
    const {
      email,
      phone_number,
      name,
      linked_to,
      email_verified,
      provider: providedProvider,
      connection,
      password,
      // Pulled out so they don't leak through ...profileFields below:
      //   user_id/provider are re-derived, verify_email is never persisted,
      //   last_ip/is_social/last_login are set by the server, and
      //   registration_completed_at is an internal self-healing flag callers
      //   must not be able to spoof.
      user_id: _providedUserId,
      verify_email: _verifyEmail,
      last_ip: _lastIp,
      is_social: _isSocial,
      last_login: _lastLogin,
      registration_completed_at: _registrationCompletedAt,
      // Everything else on userInsertSchema (given_name, family_name,
      // nickname, picture, app_metadata, user_metadata, address, birthdate,
      // etc.) is forwarded verbatim so it is actually persisted instead of
      // being silently dropped.
      ...profileFields
    } = body;

    // Look up the connection to derive the provider
    const connectionRecord = await ctx.env.data.connections.get(
      ctx.var.tenant_id,
      connection,
    );

    // Database (username/password) users get the tenant's configured
    // username-password provider — never the connection's strategy field,
    // which legacy tenants persist as the "auth2" provider literal, and
    // never a caller-supplied "auth2". The lookup above is by connection
    // id, so also classify by connection name / provider for tenants whose
    // password connection has a generated id.
    const isDatabaseUser = connectionRecord
      ? isDatabaseConnectionStrategy(connectionRecord.strategy)
      : connection === Strategy.USERNAME_PASSWORD ||
        isUsernamePasswordProvider(providedProvider);

    // Derive provider from connection, or use provided provider for migration
    const provider = isDatabaseUser
      ? await resolveUsernamePasswordProvider(ctx.env, ctx.var.tenant_id)
      : connectionRecord
        ? getProviderFromConnection(connectionRecord)
        : providedProvider || connection;

    // Parse user_id to avoid double-prefixing if client sends provider-prefixed id
    const rawUserId = body["user_id"];
    const idPart = rawUserId ? userIdParse(rawUserId) : userIdGenerate();
    const user_id = `${provider}|${idPart}`;

    try {
      // Hash password if provided for atomic creation
      let passwordData: { hash: string; algorithm: string } | undefined;
      if (password) {
        passwordData = await hashPassword(password);
      }

      // ctx.env.data is already wrapped with hooks by the management API middleware,
      // so we can use it directly to enable automatic account linking
      const userToCreate = {
        // Forward the remaining validated profile fields first; the explicit
        // keys below take precedence over anything with the same name.
        ...profileFields,
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
        // Include password for atomic user+password creation in a single transaction
        // The password is stored on the NEWLY CREATED user (user_id), which is correct
        // even if automatic account linking returns a different primary user
        ...(passwordData && { password: passwordData }),
      };

      // Create the user - this may trigger account linking
      // Password (if provided) is created atomically in the same transaction
      const result = await ctx.env.data.users.create(
        ctx.var.tenant_id,
        userToCreate,
      );

      ctx.set("user_id", result.user_id);

      await logMessage(ctx, ctx.var.tenant_id, {
        type: LogTypes.SUCCESS_API_OPERATION,
        description: "User created",
        afterState: result,
        targetType: "user",
        targetId: result.user_id,
      });

      // Build response with identities
      // If linking occurred, result will be the primary user with identities populated
      const userResponse = result.identities
        ? result
        : {
            ...result,
            identities: [pickIdentity(result)],
          };

      return ctx.json(
        auth0UserResponseSchema.parse(
          withDefaultPicture(
            userResponse,
            getIssuer(ctx.env, ctx.var.custom_domain),
          ),
        ),
        {
          status: 201,
        },
      );
    } catch (err: any) {
      if (err.message === "User already exists") {
        throw new HTTPException(409, {
          message: "User already exists",
        });
      }
      throw err;
    }
  },
});

const patchByUser_id = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "patch",
    path: "/{user_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: userInsertSchema
              .extend({
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
        Bearer: ["update:users", "auth:write"],
      },
    ],
    responses: {
      200: {
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
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
      // Passwords are only stored against users created by the native
      // username-password provider (auth2). When an Auth0-imported user
      // shares the Username-Password-Authentication connection with a
      // linked auth2 user, we must target the auth2 one so the password
      // row is readable by the login flow (which looks up by provider).
      const isPasswordConnection = connection === Strategy.USERNAME_PASSWORD;

      const matchesTarget = (u: { connection?: string; provider?: string }) =>
        isPasswordConnection
          ? isUsernamePasswordProvider(u.provider)
          : u.connection === connection;

      // For password connections, prefer a linked "auth2" identity over an
      // "auth0" primary so the bcrypt password row lands where login reads
      // it from. See username-password-provider.ts for the same auth2-first
      // rule applied at READ sites.
      const preferAuth2Linked =
        isPasswordConnection && userToPatch.provider === "auth0";

      const linkedUsers = preferAuth2Linked
        ? await data.users.list(ctx.var.tenant_id, {
            page: 0,
            per_page: 100,
            include_totals: false,
            q: `linked_to:${user_id}`,
          })
        : null;

      const auth2Linked = linkedUsers?.users.find(
        (u) => u.provider === "auth2" && matchesTarget(u),
      );

      if (auth2Linked) {
        targetUserId = auth2Linked.user_id;
        targetUser = auth2Linked;
      } else if (matchesTarget(userToPatch)) {
        // Target is the primary user
        targetUserId = user_id;
        targetUser = userToPatch;
      } else {
        // Look for a linked user with this connection
        const linkedList =
          linkedUsers ??
          (await data.users.list(ctx.var.tenant_id, {
            page: 0,
            per_page: 100,
            include_totals: false,
            q: `linked_to:${user_id}`,
          }));

        const linkedUserWithConnection = linkedList.users.find(matchesTarget);

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

    // Check if the phone_number is being changed to an existing phone_number of another user
    if (
      userFields.phone_number &&
      userFields.phone_number !== targetUser.phone_number
    ) {
      const { users: existingUsers } = await data.users.list(
        ctx.var.tenant_id,
        {
          page: 0,
          per_page: 10,
          include_totals: false,
          q: `phone_number:${userFields.phone_number}`,
        },
      );

      if (existingUsers.some((u) => u.user_id !== targetUserId)) {
        throw new HTTPException(409, {
          message: "Another user with the same phone number already exists.",
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
        if (connection === Strategy.USERNAME_PASSWORD) {
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
        // Find the identity that actually owns the password row — login
        // looks up passwords by the native database provider (auth2 or
        // auth0 once a tenant is migrated), so prefer that. Match the
        // read path's auth2-first preference (see getUsernamePasswordUser):
        // when both rows coexist during migration, the bcrypt password
        // lives under the auth2 row. Fall back to any
        // Username-Password-Authentication identity for older rows where
        // the provider wasn't a native database provider.
        passwordIdentity =
          userToPatch.identities?.find(
            (i) =>
              i.connection === Strategy.USERNAME_PASSWORD &&
              i.provider === "auth2",
          ) ??
          userToPatch.identities?.find((i) =>
            isUsernamePasswordProvider(i.provider),
          ) ??
          userToPatch.identities?.find(
            (i) => i.connection === Strategy.USERNAME_PASSWORD,
          );

        if (!passwordIdentity) {
          throw new HTTPException(400, {
            message: "User does not have a password identity",
          });
        }
      }

      const userId = `${passwordIdentity.provider}|${passwordIdentity.user_id}`;

      // Mark old password as not current (for password history)
      const existingPassword = await data.passwords.get(
        ctx.var.tenant_id,
        userId,
      );
      if (existingPassword) {
        await data.passwords.update(ctx.var.tenant_id, {
          id: existingPassword.id,
          user_id: userId,
          password: existingPassword.password,
          algorithm: existingPassword.algorithm,
          is_current: false,
        });
      }

      // Create new password
      const { hash, algorithm } = await hashPassword(password);
      await data.passwords.create(ctx.var.tenant_id, {
        user_id: userId,
        password: hash,
        algorithm,
        is_current: true,
      });
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
    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Update a User",
      beforeState: userToPatch,
      afterState: patchedUser,
      targetType: "user",
      targetId: user_id,
      body,
      response: {
        statusCode: 200,
        body: patchedUser,
      },
    });

    return ctx.json(
      auth0UserResponseSchema.parse(
        withDefaultPicture(
          patchedUser,
          getIssuer(ctx.env, ctx.var.custom_domain),
        ),
      ),
    );
  },
});

const postByUser_idIdentities = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "post",
    path: "/{user_id}/identities",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
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
        Bearer: ["update:users", "auth:write"],
      },
    ],
    responses: {
      201: {
        content: {
          "application/json": {
            schema: z.array(identitySchema),
          },
        },
        description: "Status",
      },
    },
  }),
  handler: async (ctx) => {
    const body = ctx.req.valid("json");
    const { user_id } = ctx.req.valid("param");

    const link_with = "link_with" in body ? body.link_with : body.user_id;

    if (link_with === user_id) {
      throw new HTTPException(400, {
        message: "Cannot link a user to itself.",
      });
    }

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

    const identities = [user, ...linkedusers.users].map(pickIdentity);

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Link a user identity",
      targetType: "identity",
      targetId: user_id,
    });

    return ctx.json(z.array(identitySchema).parse(identities), {
      status: 201,
    });
  },
});

const deleteByUser_idIdentitiesByProviderByLinked_user_id = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "delete",
    path: "/{user_id}/identities/{provider}/{linked_user_id}",
    request: {
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        user_id: z.string(),
        provider: z.string(),
        linked_user_id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["update:users", "auth:write"],
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
  handler: async (ctx) => {
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

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Unlink a user identity",
      targetType: "identity",
      targetId: user_id,
    });

    return ctx.json([
      auth0UserResponseSchema.parse(
        withDefaultPicture(user, getIssuer(ctx.env, ctx.var.custom_domain)),
      ),
    ]);
  },
});

const getByUser_idConnectedClients = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}/connected-clients",
    request: {
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        user_id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["read:clients", "read:users", "auth:read"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([
              z.array(connectedClientSchema),
              connectedClientsWithTotalsSchema,
            ]),
          },
        },
        description:
          "List of clients connected to this user (created via IAT-gated DCR).",
      },
    },
  }),
  handler: async (ctx) => {
    const { user_id } = ctx.req.valid("param");
    const { include_totals, page, per_page } = ctx.req.valid("query");

    const result = await ctx.env.data.clients.list(ctx.var.tenant_id, {
      page,
      per_page,
      include_totals,
      q: `owner_user_id:"${user_id}"`,
    });

    // Filter out soft-deleted clients and project to the slim shape so
    // we never leak secrets or internal config to the connected-apps UI.
    const connectedClients = result.clients
      .filter((client) => client.client_metadata?.status !== "deleted")
      .map((client) => connectedClientSchema.parse(client));

    if (!include_totals) {
      return ctx.json(connectedClients);
    }

    return ctx.json({
      connected_clients: connectedClients,
      start: result.totals?.start ?? 0,
      limit: result.totals?.limit ?? 0,
      length: connectedClients.length,
    });
  },
});

const getByUser_idSessions = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}/sessions",
    request: {
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        user_id: z.string(),
      }),
    },

    security: [
      {
        Bearer: ["read:users", "auth:read"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([z.array(sessionSchema), sessionsWithTotalsSchema]),
          },
        },
        description: "List of sessions",
      },
    },
  }),
  handler: async (ctx) => {
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
});

const getByUser_idLogs = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}/logs",
    request: {
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      params: z.object({
        user_id: z.string(),
      }),
    },
    security: [
      {
        Bearer: ["read:logs", "auth:read"],
      },
    ],
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.union([z.array(logSchema), logsWithTotalsSchema]),
          },
        },
        description: "List of logs across the user and any linked accounts",
      },
    },
  }),
  handler: async (ctx) => {
    const { user_id } = ctx.req.valid("param");
    const {
      include_totals,
      page,
      per_page,
      sort,
      q: callerQ,
    } = ctx.req.valid("query");

    const user = await ctx.env.data.users.get(ctx.var.tenant_id, user_id);
    if (!user || user.linked_to) {
      throw new HTTPException(404);
    }

    const linked = await ctx.env.data.users.list(ctx.var.tenant_id, {
      page: 0,
      per_page: 100,
      include_totals: false,
      q: `linked_to:${user_id}`,
    });

    const userIds = [user_id, ...linked.users.map((u) => u.user_id)];
    const userIdClause = userIds.map((id) => `user_id:"${id}"`).join(" OR ");
    // luceneFilter has no parentheses / precedence support: it splits on
    // " OR " globally. Without sanitization, callerQ containing " OR ..."
    // (or a leading boolean operator) could escape the user_id grouping
    // and broaden the result to other users' logs. Strip leading AND/OR
    // and reject any callerQ that still contains a top-level OR — what
    // remains is AND-joined onto the user_id clause.
    let q = userIdClause;
    if (callerQ) {
      const trimmed = callerQ.trim().replace(/^(AND|OR)\s+/i, "");
      if (/\sOR\s/i.test(trimmed)) {
        throw new HTTPException(400, {
          message: "q must not contain top-level OR",
        });
      }
      if (trimmed) {
        q = `${userIdClause} ${trimmed}`;
      }
    }

    const result = await ctx.env.data.logs.list(ctx.var.tenant_id, {
      page,
      per_page,
      include_totals,
      sort: parseSort(sort),
      q,
    });

    if (!include_totals) {
      return ctx.json(result.logs);
    }

    return ctx.json(result);
  },
});

const getByUser_idPermissions = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}/permissions",
    request: {
      params: z.object({
        user_id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      query: querySchema,
    },
    security: [
      {
        Bearer: ["read:users", "auth:read"],
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
  handler: async (ctx) => {
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
});

const postByUser_idPermissions = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "post",
    path: "/{user_id}/permissions",
    request: {
      params: z.object({
        user_id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              permissions: z.array(
                z.object({
                  permission_name: z.string(),
                  resource_server_identifier: z.string(),
                  organization_id: z.string().optional(),
                }),
              ),
            }),
          },
        },
      },
    },
    security: [
      {
        Bearer: ["update:users", "auth:write"],
      },
    ],
    responses: {
      201: {
        description: "Permissions assigned to user",
      },
    },
  }),
  handler: async (ctx) => {
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
          organization_id: permission.organization_id,
        },
        permission.organization_id,
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to assign permissions to user",
        });
      }
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Assign permissions to a user",
      targetType: "user_permission",
      targetId: user_id,
    });

    return ctx.json(
      { message: "Permissions assigned successfully" },
      { status: 201 },
    );
  },
});

const deleteByUser_idPermissions = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "delete",
    path: "/{user_id}/permissions",
    request: {
      params: z.object({
        user_id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              permissions: z.array(
                z.object({
                  permission_name: z.string(),
                  resource_server_identifier: z.string(),
                  organization_id: z.string().optional(),
                }),
              ),
            }),
          },
        },
      },
    },
    security: [
      {
        Bearer: ["update:users", "auth:write"],
      },
    ],
    responses: {
      200: {
        description: "Permissions removed from user",
      },
    },
  }),
  handler: async (ctx) => {
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
        {
          resource_server_identifier: permission.resource_server_identifier,
          permission_name: permission.permission_name,
        },
        permission.organization_id,
      );

      if (!success) {
        throw new HTTPException(500, {
          message: "Failed to remove permissions from user",
        });
      }
    }

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Remove permissions from a user",
      targetType: "user_permission",
      targetId: user_id,
    });

    return ctx.json({ message: "Permissions removed successfully" });
  },
});

const getByUser_idRoles = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}/roles",
    request: {
      params: z.object({ user_id: z.string() }),
      headers: z.object({ "tenant-id": z.string() }),
    },
    security: [{ Bearer: ["read:users", "auth:read"] }],
    responses: {
      200: {
        content: { "application/json": { schema: roleListSchema } },
        description: "User roles",
      },
    },
  }),
  handler: async (ctx) => {
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
});

const postByUser_idRoles = defineRoute({
  route: createRoute({
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
    security: [{ Bearer: ["update:users", "auth:write"] }],
    responses: { 201: { description: "Roles assigned to user" } },
  }),
  handler: async (ctx) => {
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

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Assign roles to a user",
      targetType: "user_role",
      targetId: user_id,
    });

    return ctx.json(
      { message: "Roles assigned successfully" },
      { status: 201 },
    );
  },
});

const deleteByUser_idRoles = defineRoute({
  route: createRoute({
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
    security: [{ Bearer: ["update:users", "auth:write"] }],
    responses: { 200: { description: "Roles removed from user" } },
  }),
  handler: async (ctx) => {
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

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Remove roles from a user",
      targetType: "user_role",
      targetId: user_id,
    });

    return ctx.json({ message: "Roles removed successfully" });
  },
});

const getByUser_idOrganizations = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "get",
    path: "/{user_id}/organizations",
    request: {
      params: z.object({
        user_id: z.string(),
      }),
      query: querySchema,
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [{ Bearer: ["read:users", "auth:read"] }],
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
  handler: async (ctx) => {
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
});

const deleteByUser_idOrganizationsByOrganization_id = defineRoute({
  route: createRoute({
    tags: ["users"],
    method: "delete",
    path: "/{user_id}/organizations/{organization_id}",
    request: {
      params: z.object({
        user_id: z.string(),
        organization_id: z.string(),
      }),
      headers: z.object({
        "tenant-id": z.string().optional(),
      }),
    },
    security: [{ Bearer: ["update:users", "auth:write"] }],
    responses: {
      200: {
        description: "User removed from organization successfully",
      },
    },
  }),
  handler: async (ctx) => {
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

    await logMessage(ctx, ctx.var.tenant_id, {
      type: LogTypes.SUCCESS_API_OPERATION,
      description: "Remove a user from an organization",
      targetType: "user_organization",
      targetId: user_id,
    });

    return ctx.json({
      message: "User removed from organization successfully",
    });
  },
});

export const userRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getRoot,
  getByUser_id,
  deleteByUser_id,
  postRoot,
  patchByUser_id,
  postByUser_idIdentities,
  deleteByUser_idIdentitiesByProviderByLinked_user_id,
  getByUser_idConnectedClients,
  getByUser_idSessions,
  getByUser_idLogs,
  getByUser_idPermissions,
  postByUser_idPermissions,
  deleteByUser_idPermissions,
  getByUser_idRoles,
  postByUser_idRoles,
  deleteByUser_idRoles,
  getByUser_idOrganizations,
  deleteByUser_idOrganizationsByOrganization_id,
] as const);
