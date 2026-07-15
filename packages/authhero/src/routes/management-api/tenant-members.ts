import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { inviteSchema, roleSchema } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../../types";
import { defineRoute } from "../../utils/define-route";
import { requireTenantId } from "./helpers";
import {
  TenantMembersBackend,
  TenantMembersNotFoundError,
  tenantInvitationInputSchema,
  tenantMemberSchema,
  tenantMembersListSchema,
} from "../../tenant-members/types";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

/** Build the request's backend (local org resolution, or a control-plane hop). */
export type GetTenantMembersBackend = (
  ctx: Ctx,
) => TenantMembersBackend | Promise<TenantMembersBackend>;

/**
 * Pin the tenant to the caller's verified organization claim. A tenant's team
 * is an org on the control plane whose `name` equals the tenant id, and access
 * is granted by the token's `org_name` claim matching that name. Requiring
 * `org_name === tenant_id` here — server-side, from the token, NOT from the URL
 * — is what stops a tenant-A admin from managing tenant B by swapping the
 * `tenant-id` header. (The remote backend independently re-pins the org from
 * the service token's `tenant_id` claim on the control plane, so this is one of
 * two independent checks.)
 */
function pinnedTenantId(ctx: Ctx): string {
  const tenantId = requireTenantId(ctx);
  const orgName = ctx.var.org_name;
  if (!orgName || orgName.toLowerCase() !== tenantId.toLowerCase()) {
    throw new HTTPException(403, {
      message:
        "Managing this tenant's team requires an organization token whose org_name matches the tenant.",
    });
  }
  return tenantId;
}

/** Map the backend's "not there" signal to Auth0's 404. */
async function orNotFound<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof TenantMembersNotFoundError) {
      throw new HTTPException(404, { message: "Not found" });
    }
    throw err;
  }
}

const pageQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  per_page: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
});

const userIdsBodySchema = z.object({
  user_ids: z.array(z.string()).min(1),
});

const rolesBodySchema = z.object({
  roles: z.array(z.string()).min(1),
});

/**
 * `GET/POST/DELETE /api/v2/tenant-members` — lets a tenant admin manage who
 * administers their tenant, from the per-tenant admin UI, without a
 * control-plane login. The heavy lifting (resolving the control-plane org,
 * writing membership/roles/invitations) is delegated to a
 * {@link TenantMembersBackend}; this layer only pins the tenant to the token's
 * org claim and shapes responses.
 */
export function createTenantMembersRoutes(getBackend: GetTenantMembersBackend) {
  const listMembers = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "get",
      path: "/",
      request: {
        query: pageQuerySchema,
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:organizations"] }],
      responses: {
        200: {
          content: { "application/json": { schema: tenantMembersListSchema } },
          description: "The tenant's team members",
        },
      },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { page, per_page, q } = ctx.req.valid("query");
      const backend = await getBackend(ctx);
      const result = await orNotFound(() =>
        backend.listMembers(tenantId, { page, per_page, q }),
      );
      return ctx.json(result);
    },
  });

  const addMembers = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "post",
      path: "/",
      request: {
        headers: z.object({ "tenant-id": z.string().optional() }),
        body: {
          content: { "application/json": { schema: userIdsBodySchema } },
        },
      },
      security: [{ Bearer: ["update:organizations"] }],
      responses: { 204: { description: "Members added" } },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { user_ids } = ctx.req.valid("json");
      const backend = await getBackend(ctx);
      await orNotFound(() => backend.addMembers(tenantId, user_ids));
      return ctx.body(null, 204);
    },
  });

  const removeMembers = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "delete",
      path: "/",
      request: {
        headers: z.object({ "tenant-id": z.string().optional() }),
        body: {
          content: { "application/json": { schema: userIdsBodySchema } },
        },
      },
      security: [{ Bearer: ["update:organizations"] }],
      responses: { 204: { description: "Members removed" } },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { user_ids } = ctx.req.valid("json");
      const backend = await getBackend(ctx);
      await orNotFound(() => backend.removeMembers(tenantId, user_ids));
      return ctx.body(null, 204);
    },
  });

  const listMemberRoles = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "get",
      path: "/{user_id}/roles",
      request: {
        params: z.object({ user_id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:organization_member_roles"] }],
      responses: {
        200: {
          content: { "application/json": { schema: z.array(roleSchema) } },
          description: "The member's roles in the tenant",
        },
      },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { user_id } = ctx.req.valid("param");
      const backend = await getBackend(ctx);
      const roles = await orNotFound(() =>
        backend.listMemberRoles(tenantId, user_id),
      );
      return ctx.json(roles);
    },
  });

  const assignMemberRoles = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "post",
      path: "/{user_id}/roles",
      request: {
        params: z.object({ user_id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
        body: { content: { "application/json": { schema: rolesBodySchema } } },
      },
      security: [{ Bearer: ["create:organization_member_roles"] }],
      responses: { 204: { description: "Roles assigned" } },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { user_id } = ctx.req.valid("param");
      const { roles } = ctx.req.valid("json");
      const backend = await getBackend(ctx);
      await orNotFound(() =>
        backend.assignMemberRoles(tenantId, user_id, roles),
      );
      return ctx.body(null, 204);
    },
  });

  const removeMemberRoles = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "delete",
      path: "/{user_id}/roles",
      request: {
        params: z.object({ user_id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
        body: { content: { "application/json": { schema: rolesBodySchema } } },
      },
      security: [{ Bearer: ["delete:organization_member_roles"] }],
      responses: { 204: { description: "Roles removed" } },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { user_id } = ctx.req.valid("param");
      const { roles } = ctx.req.valid("json");
      const backend = await getBackend(ctx);
      await orNotFound(() =>
        backend.removeMemberRoles(tenantId, user_id, roles),
      );
      return ctx.body(null, 204);
    },
  });

  const listRoles = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "get",
      path: "/roles",
      request: {
        query: pageQuerySchema,
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:roles"] }],
      responses: {
        200: {
          content: { "application/json": { schema: z.array(roleSchema) } },
          description: "Roles that can be granted to a team member",
        },
      },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { page, per_page, q } = ctx.req.valid("query");
      const backend = await getBackend(ctx);
      const roles = await orNotFound(() =>
        backend.listRoles(tenantId, { page, per_page, q }),
      );
      return ctx.json(roles);
    },
  });

  const listInvitations = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "get",
      path: "/invitations",
      request: {
        query: pageQuerySchema,
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["read:organizations"] }],
      responses: {
        200: {
          content: { "application/json": { schema: z.array(inviteSchema) } },
          description: "Pending team invitations",
        },
      },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { page, per_page } = ctx.req.valid("query");
      const backend = await getBackend(ctx);
      const invites = await orNotFound(() =>
        backend.listInvitations(tenantId, { page, per_page }),
      );
      return ctx.json(invites);
    },
  });

  const createInvitation = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "post",
      path: "/invitations",
      request: {
        headers: z.object({ "tenant-id": z.string().optional() }),
        body: {
          content: {
            "application/json": { schema: tenantInvitationInputSchema },
          },
        },
      },
      security: [{ Bearer: ["update:organizations"] }],
      responses: {
        201: {
          content: { "application/json": { schema: inviteSchema } },
          description: "The created invitation",
        },
      },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const input = ctx.req.valid("json");
      const backend = await getBackend(ctx);
      const invite = await orNotFound(() =>
        backend.createInvitation(tenantId, input),
      );
      return ctx.json(invite, 201);
    },
  });

  const revokeInvitation = defineRoute({
    route: createRoute({
      tags: ["tenant-members"],
      method: "delete",
      path: "/invitations/{invitation_id}",
      request: {
        params: z.object({ invitation_id: z.string() }),
        headers: z.object({ "tenant-id": z.string().optional() }),
      },
      security: [{ Bearer: ["update:organizations"] }],
      responses: { 204: { description: "Invitation revoked" } },
    }),
    handler: async (ctx) => {
      const tenantId = pinnedTenantId(ctx);
      const { invitation_id } = ctx.req.valid("param");
      const backend = await getBackend(ctx);
      await orNotFound(() =>
        backend.revokeInvitation(tenantId, invitation_id),
      );
      return ctx.body(null, 204);
    },
  });

  return new OpenAPIHono<{
    Bindings: Bindings;
    Variables: Variables;
  }>().openapiRoutes([
    // More specific literal paths before the `/{user_id}` param routes so
    // `/roles` and `/invitations` are not swallowed by `/{user_id}/roles`.
    listRoles,
    listInvitations,
    createInvitation,
    revokeInvitation,
    listMembers,
    addMembers,
    removeMembers,
    listMemberRoles,
    assignMemberRoles,
    removeMemberRoles,
  ] as const);
}

export { tenantMemberSchema };
