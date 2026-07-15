import { z } from "@hono/zod-openapi";
import { inviteSchema, roleSchema } from "@authhero/adapter-interfaces";

/**
 * A tenant's "team" is not the tenant's own users. It is an organization on the
 * control-plane tenant whose `name` equals the tenant id (see
 * `@authhero/multi-tenancy` provisioning). Its members are control-plane users
 * holding org-scoped roles, and the tenant shard cannot write those rows.
 *
 * `TenantMembersBackend` is the seam that hides "where the team actually lives":
 *  - on a single-instance / control-plane deployment it resolves the org and
 *    acts on the local control-plane adapters (`createLocalTenantMembersBackend`);
 *  - on a Workers-for-Platforms shard it delegates every call up to the control
 *    plane over the shared control-plane client
 *    (`createControlPlaneTenantMembersAdapter`).
 *
 * Every method takes the CHILD `tenantId` (the tenant whose team is managed),
 * never an organization id — the org is resolved from the tenant id internally.
 * The management route that fronts this has already pinned `tenantId` to the
 * caller's verified org claim, so the backend never has to re-authorize.
 */

export const tenantMemberSchema = z.object({
  user_id: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
  roles: z.array(roleSchema).default([]),
});
export type TenantMember = z.infer<typeof tenantMemberSchema>;

export const tenantMembersListSchema = z.object({
  members: z.array(tenantMemberSchema),
  start: z.number(),
  limit: z.number(),
  total: z.number(),
});
export type TenantMembersListResult = z.infer<typeof tenantMembersListSchema>;

/**
 * The invitee-facing fields of an invitation create. `organization_id`,
 * `invitation_url` and `id` are resolved server-side (the org from the tenant
 * id, the URL from the control-plane issuer), never trusted from the caller —
 * that is the fix for the admin UI's "invite silently disappears when the
 * client id isn't in local storage" foot-gun.
 */
export const tenantInvitationInputSchema = z.object({
  invitee: z.object({ email: z.string().email() }),
  inviter: z.object({ name: z.string().optional() }).default({}),
  roles: z.array(z.string()).default([]).optional(),
  send_invitation_email: z.boolean().default(true).optional(),
  ttl_sec: z.number().int().max(2592000).optional(),
});
// `z.input`, not `z.infer`: `inviter`/`send_invitation_email` carry defaults,
// so callers may omit them (the schema fills them on parse).
export type TenantInvitationInput = z.input<typeof tenantInvitationInputSchema>;

export interface TenantMembersPageParams {
  page?: number;
  per_page?: number;
  q?: string;
}

export type TenantInvitation = z.infer<typeof inviteSchema>;
export type TenantRole = z.infer<typeof roleSchema>;

export interface TenantMembersBackend {
  listMembers(
    tenantId: string,
    params?: TenantMembersPageParams,
  ): Promise<TenantMembersListResult>;
  addMembers(tenantId: string, userIds: string[]): Promise<void>;
  removeMembers(tenantId: string, userIds: string[]): Promise<void>;
  listMemberRoles(tenantId: string, userId: string): Promise<TenantRole[]>;
  assignMemberRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
  ): Promise<void>;
  removeMemberRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
  ): Promise<void>;
  /** Roles that can be granted to a member — the control-plane tenant's roles. */
  listRoles(
    tenantId: string,
    params?: TenantMembersPageParams,
  ): Promise<TenantRole[]>;
  listInvitations(
    tenantId: string,
    params?: TenantMembersPageParams,
  ): Promise<TenantInvitation[]>;
  createInvitation(
    tenantId: string,
    input: TenantInvitationInput,
  ): Promise<TenantInvitation>;
  revokeInvitation(tenantId: string, invitationId: string): Promise<void>;
}

/**
 * Base for the "asked for something that isn't there" cases a backend can hit.
 * The management route maps any of these to a 404. It is a distinct type (not a
 * bare HTTPException) so the local and remote backends can agree on the
 * semantics without depending on hono.
 */
export class TenantMembersNotFoundError extends Error {}

/** The tenant id names no control-plane organization — i.e. no team. */
export class TenantOrganizationNotFoundError extends TenantMembersNotFoundError {
  constructor(tenantId: string) {
    super(`No organization found for tenant "${tenantId}"`);
    this.name = "TenantOrganizationNotFoundError";
  }
}

/** The invitation does not exist, or belongs to a different tenant's team. */
export class TenantInvitationNotFoundError extends TenantMembersNotFoundError {
  constructor(invitationId: string) {
    super(`Invitation "${invitationId}" not found`);
    this.name = "TenantInvitationNotFoundError";
  }
}
