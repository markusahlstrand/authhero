import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  organizationSchema,
  organizationInsertSchema,
  totalsSchema,
  roleListSchema,
  inviteSchema,
  inviteInsertSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import {
  generateOrganizationId,
  generateInviteId,
} from "../../utils/entity-id";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";

// Query schema for invitations list endpoint
const invitationsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .default("0")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Page index of the results to return. First page is 0.",
    }),
  per_page: z
    .string()
    .optional()
    .default("50")
    .transform((p) => parseInt(p, 10))
    .openapi({
      description: "Number of results per page. Defaults to 50.",
    }),
  include_totals: z
    .string()
    .optional()
    .default("false")
    .transform((it) => it === "true")
    .openapi({
      description:
        "When true, return results inside an object that also contains the start and limit. When false (default), a direct array of results is returned.",
    }),
  fields: z.string().optional().openapi({
    description:
      "Comma-separated list of fields to include or exclude (based on value provided for include_fields) in the result. Leave empty to retrieve all fields.",
  }),
  include_fields: z
    .string()
    .optional()
    .default("true")
    .transform((it) => it === "true")
    .openapi({
      description:
        "Whether specified fields are to be included (true) or excluded (false). Defaults to true.",
    }),
  sort: z.string().optional().default("created_at:-1").openapi({
    description:
      "Field to sort by. Use field:order where order is 1 for ascending and -1 for descending. Defaults to created_at:-1.",
  }),
});

// Response schema for invitations list (with totals)
const invitationsListWithTotalsSchema = z.object({
  invitations: z.array(inviteSchema),
  start: z.number(),
  limit: z.number(),
  length: z.number(),
});

// Request schema for creating invitations (organization_id and invitation_url come from API layer)
const inviteCreateRequestSchema = inviteInsertSchema.omit({
  organization_id: true,
  invitation_url: true,
});

const organizationsWithTotalsSchema = totalsSchema.extend({
  organizations: z.array(organizationSchema),
});

// Schema for organization member as per Auth0 API spec
const organizationMemberSchema = z.object({
  user_id: z.string().openapi({
    description: "ID of this user",
  }),
  email: z.string().email().optional().openapi({
    description: "Email address of this user",
    format: "email",
  }),
  roles: z.array(z.object({})).default([]).openapi({
    description: "Array of roles assigned to this user in the organization",
  }),
});

// Schema for paginated members response
const organizationMembersWithPaginationSchema = z.object({
  start: z.number().openapi({
    description: "Start index of the current page",
  }),
  limit: z.number().openapi({
    description: "Number of items per page",
  }),
  total: z.number().openapi({
    description: "Total number of members",
  }),
  members: z.array(organizationMemberSchema).openapi({
    description: "Array of organization members",
  }),
});

// Schema for members response with next token
const organizationMembersWithNextSchema = z.object({
  next: z.string().optional().openapi({
    description: "Checkpoint ID to be used to retrieve the next set of results",
  }),
  members: z.array(organizationMemberSchema).openapi({
    description: "Array of organization members",
  }),
});

const addMembersRequestSchema = z.object({
  members: z.array(z.string()).openapi({
    description: "Array of user IDs to add to the organization",
  }),
});

const removeMembersRequestSchema = z.object({
  members: z.array(z.string()).openapi({
    description: "Array of user IDs to remove from the organization",
  }),
});

export const organizationRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /api/v2/organizations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
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
                organizationsWithTotalsSchema,
                z.array(organizationSchema),
              ]),
            },
          },
          description: "List of organizations",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { page, per_page, include_totals, sort, q } =
        ctx.req.valid("query");

      const result = await ctx.env.data.organizations.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q,
      });

      if (include_totals) {
        return ctx.json(result);
      }

      return ctx.json(result.organizations);
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "get",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
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
              schema: organizationSchema,
            },
          },
          description: "An organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const organization = await ctx.env.data.organizations.get(tenant_id, id);

      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      return ctx.json(organization);
    },
  )
  // --------------------------------
  // DELETE /api/v2/organizations/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "delete",
      path: "/{id}",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        200: {
          description: "Organization deleted successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");

      const result = await ctx.env.data.organizations.remove(tenant_id, id);
      if (!result) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      return ctx.text("OK");
    },
  )
  // --------------------------------
  // PATCH /api/v2/organizations/:id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "patch",
      path: "/{id}",
      request: {
        body: {
          content: {
            "application/json": {
              schema: organizationInsertSchema.partial(),
            },
          },
        },
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
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
              schema: organizationSchema,
            },
          },
          description: "The updated organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      const updated = await ctx.env.data.organizations.update(
        tenant_id,
        id,
        body,
      );

      if (!updated) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      const organization = await ctx.env.data.organizations.get(tenant_id, id);

      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      return ctx.json(organization);
    },
  )
  // --------------------------------
  // POST /api/v2/organizations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": {
              schema: organizationInsertSchema,
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string(),
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
              schema: organizationSchema,
            },
          },
          description: "The created organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const body = ctx.req.valid("json");

      const organizationData = {
        ...body,
        id: body.id || generateOrganizationId(),
      };

      const organization = await ctx.env.data.organizations.create(
        tenant_id,
        organizationData,
      );

      return ctx.json(organization, { status: 201 });
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id/members
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "get",
      path: "/{id}/members",
      request: {
        params: z.object({
          id: z.string(),
        }),
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
                z.array(organizationMemberSchema),
                organizationMembersWithPaginationSchema,
                organizationMembersWithNextSchema,
              ]),
            },
          },
          description: "List of organization members",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId } = ctx.req.valid("param");
      const { page, per_page, include_totals, sort } = ctx.req.valid("query");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Get user-organization relationships
      const userOrgsResult = await ctx.env.data.userOrganizations.list(
        tenant_id,
        {
          page,
          per_page,
          include_totals,
          sort: parseSort(sort),
          q: `organization_id:${organizationId}`,
        },
      );

      // Get user details for each member
      const members: Array<{
        user_id: string;
        email?: string;
        roles: Array<any>;
      }> = [];

      for (const userOrg of userOrgsResult.userOrganizations) {
        const user = await ctx.env.data.users.get(tenant_id, userOrg.user_id);
        if (user) {
          members.push({
            user_id: user.user_id,
            email: user.email || undefined,
            roles: [], // TODO: Implement roles when organization roles are available
          });
        }
      }

      // Return different formats based on query parameters
      if (include_totals) {
        // Return with pagination info
        return ctx.json({
          start: userOrgsResult.start,
          limit: userOrgsResult.limit,
          total: userOrgsResult.length,
          members,
        });
      }

      // Return simple array
      return ctx.json(members);
    },
  )
  // --------------------------------
  // POST /api/v2/organizations/:id/members
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "post",
      path: "/{id}/members",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: addMembersRequestSchema,
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
        204: {
          description: "Members added successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId } = ctx.req.valid("param");
      const { members } = ctx.req.valid("json");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Add each user to the organization
      for (const userId of members) {
        // Check if relationship already exists
        const existing = await ctx.env.data.userOrganizations.list(tenant_id, {
          q: `user_id:${userId}`,
          per_page: 1,
        });

        const alreadyMember = existing.userOrganizations.some(
          (uo) => uo.organization_id === organizationId,
        );

        if (!alreadyMember) {
          await ctx.env.data.userOrganizations.create(tenant_id, {
            user_id: userId,
            organization_id: organizationId,
          });
        }
      }

      return new Response(null, { status: 204 });
    },
  )
  // --------------------------------
  // DELETE /api/v2/organizations/:id/members
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "delete",
      path: "/{id}/members",
      request: {
        params: z.object({
          id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: removeMembersRequestSchema,
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
          description: "Members removed successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId } = ctx.req.valid("param");
      const { members } = ctx.req.valid("json");

      // Remove each user from the organization
      for (const userId of members) {
        const userOrgs = await ctx.env.data.userOrganizations.list(tenant_id, {
          q: `user_id:${userId}`,
          per_page: 100, // Should be enough for most cases
        });

        const membershipToRemove = userOrgs.userOrganizations.find(
          (uo) => uo.organization_id === organizationId,
        );

        if (membershipToRemove) {
          await ctx.env.data.userOrganizations.remove(
            tenant_id,
            membershipToRemove.id,
          );
        }
      }

      return ctx.json({ message: "Members removed successfully" });
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id/members/:user_id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "get",
      path: "/{id}/members/{user_id}/roles",
      request: {
        params: z.object({
          id: z.string(),
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
              schema: roleListSchema,
            },
          },
          description: "User roles in organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId, user_id } = ctx.req.valid("param");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Verify user exists
      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Get user roles in this organization
      const roles = await ctx.env.data.userRoles.list(
        tenant_id,
        user_id,
        undefined,
        organizationId,
      );

      return ctx.json(roles);
    },
  )
  // --------------------------------
  // POST /api/v2/organizations/:id/members/:user_id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "post",
      path: "/{id}/members/{user_id}/roles",
      request: {
        params: z.object({
          id: z.string(),
          user_id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                roles: z.array(z.string()).openapi({
                  description: "List of role IDs to associate with the user",
                }),
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
          description: "Roles assigned successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId, user_id } = ctx.req.valid("param");
      const { roles } = ctx.req.valid("json");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Verify user exists
      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Assign roles to user in this organization
      for (const roleId of roles) {
        // Verify role exists
        const role = await ctx.env.data.roles.get(tenant_id, roleId);
        if (!role) {
          throw new HTTPException(400, { message: `Role ${roleId} not found` });
        }

        const success = await ctx.env.data.userRoles.create(
          tenant_id,
          user_id,
          roleId,
          organizationId,
        );
        if (!success) {
          throw new HTTPException(500, {
            message: `Failed to assign role ${roleId} to user`,
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
  // DELETE /api/v2/organizations/:id/members/:user_id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "delete",
      path: "/{id}/members/{user_id}/roles",
      request: {
        params: z.object({
          id: z.string(),
          user_id: z.string(),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
        body: {
          content: {
            "application/json": {
              schema: z.object({
                roles: z.array(z.string()).openapi({
                  description: "List of role IDs to remove from the user",
                }),
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
          description: "Roles removed successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId, user_id } = ctx.req.valid("param");
      const { roles } = ctx.req.valid("json");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Verify user exists
      const user = await ctx.env.data.users.get(tenant_id, user_id);
      if (!user) {
        throw new HTTPException(404, { message: "User not found" });
      }

      // Remove roles from user in this organization
      for (const roleId of roles) {
        const success = await ctx.env.data.userRoles.remove(
          tenant_id,
          user_id,
          roleId,
          organizationId,
        );
        if (!success) {
          throw new HTTPException(500, {
            message: `Failed to remove role ${roleId} from user`,
          });
        }
      }

      return ctx.json({ message: "Roles removed successfully" });
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id/roles
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "get",
      path: "/{id}/roles",
      request: {
        params: z.object({
          id: z.string(),
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
              schema: roleListSchema,
            },
          },
          description: "List of roles available in organization",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId } = ctx.req.valid("param");
      const { page, per_page, sort, q } = ctx.req.valid("query");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // For now, return all roles in the tenant
      // TODO: In the future, organizations might have their own roles
      const result = await ctx.env.data.roles.list(tenant_id, {
        page,
        per_page,
        sort: parseSort(sort),
        q,
      });

      return ctx.json(result.roles);
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id/invitations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "get",
      path: "/{id}/invitations",
      request: {
        params: z.object({
          id: z.string().openapi({
            description: "Organization ID",
            param: { name: "id", in: "path" },
          }),
        }),
        query: invitationsQuerySchema,
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
                z.array(inviteSchema),
                invitationsListWithTotalsSchema,
              ]),
            },
          },
          description: "List of organization invitations",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organization_id } = ctx.req.valid("param");
      const { page, per_page, include_totals, fields, include_fields, sort } =
        ctx.req.valid("query");

      // Verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organization_id,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      const result = await ctx.env.data.invites.list(tenant_id, {
        page,
        per_page,
      });

      // Filter by organization_id
      let filteredInvites = result.invites.filter(
        (invite) => invite.organization_id === organization_id,
      );

      // Apply sorting
      if (sort) {
        const sortConfig = parseSort(sort);
        if (sortConfig) {
          const { sort_by, sort_order } = sortConfig;
          filteredInvites.sort((a, b) => {
            const aValue = a[sort_by as keyof typeof a];
            const bValue = b[sort_by as keyof typeof b];
            if (aValue === undefined || bValue === undefined) return 0;
            if (aValue === bValue) return 0;
            const comparison = aValue < bValue ? -1 : 1;
            return sort_order === "asc" ? comparison : -comparison;
          });
        }
      }

      // Apply field filtering
      if (fields) {
        const fieldList = fields.split(",").map((f) => f.trim());
        filteredInvites = filteredInvites.map((invite) => {
          const filtered: any = {};
          for (const key of Object.keys(invite)) {
            const shouldInclude = include_fields
              ? fieldList.includes(key)
              : !fieldList.includes(key);
            if (shouldInclude) {
              filtered[key] = invite[key as keyof typeof invite];
            }
          }
          return filtered;
        });
      }

      // Return with totals if requested
      if (include_totals) {
        return ctx.json({
          invitations: filteredInvites,
          start: page * per_page,
          limit: per_page,
          length: filteredInvites.length,
        });
      }

      return ctx.json(filteredInvites);
    },
  )
  // --------------------------------
  // GET /api/v2/organizations/:id/invitations/:invitation_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "get",
      path: "/{id}/invitations/{invitation_id}",
      request: {
        params: z.object({
          id: z.string().openapi({
            description: "Organization ID",
            param: { name: "id", in: "path" },
          }),
          invitation_id: z.string().openapi({
            description: "Invitation ID",
            param: { name: "invitation_id", in: "path" },
          }),
        }),
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
              schema: inviteSchema,
            },
          },
          description: "An invitation",
        },
        404: {
          description: "Invitation not found",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organization_id, invitation_id } = ctx.req.valid("param");

      const invite = await ctx.env.data.invites.get(tenant_id, invitation_id);

      if (!invite || invite.organization_id !== organization_id) {
        throw new HTTPException(404, { message: "Invitation not found" });
      }

      return ctx.json(invite);
    },
  )
  // --------------------------------
  // POST /api/v2/organizations/:id/invitations
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "post",
      path: "/{id}/invitations",
      request: {
        params: z.object({
          id: z.string().openapi({
            description: "Organization ID",
            param: { name: "id", in: "path" },
          }),
        }),
        body: {
          content: {
            "application/json": {
              schema: inviteCreateRequestSchema,
            },
          },
        },
        headers: z.object({
          "tenant-id": z.string(),
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
              schema: inviteSchema,
            },
          },
          description: "The created invitation",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organization_id } = ctx.req.valid("param");
      const body = ctx.req.valid("json");

      // Verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organization_id,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Generate invitation ID and URL
      const inviteId = generateInviteId();
      const invitationUrl = `https://invite.placeholder/${inviteId}`;

      const inviteData = {
        ...body,
        organization_id,
        invitation_url: invitationUrl,
      };

      const invite = await ctx.env.data.invites.create(tenant_id, inviteData);

      return ctx.json(invite, { status: 201 });
    },
  )
  // --------------------------------
  // DELETE /api/v2/organizations/:id/invitations/:invitation_id
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["organizations"],
      method: "delete",
      path: "/{id}/invitations/{invitation_id}",
      request: {
        params: z.object({
          id: z.string().openapi({
            description: "Organization ID",
            param: { name: "id", in: "path" },
          }),
          invitation_id: z.string().openapi({
            description: "Invitation ID",
            param: { name: "invitation_id", in: "path" },
          }),
        }),
        headers: z.object({
          "tenant-id": z.string(),
        }),
      },
      security: [
        {
          Bearer: ["auth:write"],
        },
      ],
      responses: {
        204: {
          description: "Invitation deleted successfully",
        },
        404: {
          description: "Invitation not found",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organization_id, invitation_id } = ctx.req.valid("param");

      // Verify the invitation exists and belongs to the organization
      const invite = await ctx.env.data.invites.get(tenant_id, invitation_id);
      if (!invite || invite.organization_id !== organization_id) {
        throw new HTTPException(404, { message: "Invitation not found" });
      }

      const result = await ctx.env.data.invites.remove(
        tenant_id,
        invitation_id,
      );
      if (!result) {
        throw new HTTPException(404, { message: "Invitation not found" });
      }

      return ctx.body(null, { status: 204 });
    },
  );
