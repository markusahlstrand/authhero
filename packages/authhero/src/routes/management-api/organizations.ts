import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  organizationSchema,
  organizationInsertSchema,
  totalsSchema,
  userOrganizationSchema,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import { querySchema } from "../../types/auth0/Query";
import { parseSort } from "../../utils/sort";

const organizationsWithTotalsSchema = totalsSchema.extend({
  organizations: z.array(organizationSchema),
});

const userOrganizationsWithTotalsSchema = totalsSchema.extend({
  userOrganizations: z.array(userOrganizationSchema),
});

const addMembersRequestSchema = z.object({
  users: z.array(z.string()).openapi({
    description: "Array of user IDs to add to the organization",
  }),
});

const removeMembersRequestSchema = z.object({
  users: z.array(z.string()).openapi({
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
        id: body.id || nanoid(),
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
                userOrganizationsWithTotalsSchema,
                z.array(userOrganizationSchema),
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

      const result = await ctx.env.data.userOrganizations.list(tenant_id, {
        page,
        per_page,
        include_totals,
        sort: parseSort(sort),
        q: `organization_id:${organizationId}`,
      });

      if (include_totals) {
        return ctx.json(result);
      }

      return ctx.json(result.userOrganizations);
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
        201: {
          description: "Members added successfully",
        },
      },
    }),
    async (ctx) => {
      const { "tenant-id": tenant_id } = ctx.req.valid("header");
      const { id: organizationId } = ctx.req.valid("param");
      const { users } = ctx.req.valid("json");

      // First verify organization exists
      const organization = await ctx.env.data.organizations.get(
        tenant_id,
        organizationId,
      );
      if (!organization) {
        throw new HTTPException(404, { message: "Organization not found" });
      }

      // Add each user to the organization
      for (const userId of users) {
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

      return ctx.json(
        { message: "Members added successfully" },
        { status: 201 },
      );
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
      const { users } = ctx.req.valid("json");

      // Remove each user from the organization
      for (const userId of users) {
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
  );
