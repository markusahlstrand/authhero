import {
  DataAdapters,
  Organization,
} from "@authhero/adapter-interfaces";
import { generateInviteId } from "../utils/entity-id";
import { getDefaultUserPicture } from "../helpers/avatar";
import {
  TenantInvitation,
  TenantInvitationInput,
  TenantInvitationNotFoundError,
  TenantMember,
  TenantMembersBackend,
  TenantMembersListResult,
  TenantMembersPageParams,
  TenantOrganizationNotFoundError,
  TenantRole,
} from "./types";

/** The control-plane adapters the team lives in. */
type TeamAdapters = Pick<
  DataAdapters,
  | "organizations"
  | "userOrganizations"
  | "userRoles"
  | "users"
  | "roles"
  | "invites"
>;

export interface LocalTenantMembersBackendOptions {
  /**
   * Adapters bound to the CONTROL-PLANE database — the team lives there, not on
   * the tenant shard. On the control-plane instance this is just `ctx.env.data`.
   */
  data: TeamAdapters;
  /** Tenant id under which the org rows are stored (the control-plane tenant). */
  controlPlaneTenantId: string;
  /** Issuer used to build invitation acceptance links and default avatars. */
  issuer: string;
  /**
   * Client id embedded in invitation links. Resolved server-side so the caller
   * never supplies it (the admin-UI bug this fixes). Without it, invitations
   * cannot be created and `createInvitation` throws.
   */
  invitationClientId?: string;
  /**
   * Best-effort invitation email delivery. Bound to a request context at the
   * call site (it needs branding/email infra). Failures must not fail the
   * create — Auth0 returns the invite even when delivery fails.
   */
  sendInvitationEmail?: (params: {
    to: string;
    invitationUrl: string;
    inviterName?: string;
    organizationName: string;
    ttlSec: number;
  }) => Promise<void>;
}

/**
 * A `TenantMembersBackend` that resolves the tenant's control-plane
 * organization and manages membership/roles/invitations directly against the
 * control-plane adapters. Used where the code already runs with the
 * control-plane database in reach: single-instance deployments (via the
 * management route) and the control-plane proxy resource (which fronts remote
 * shards).
 */
export function createLocalTenantMembersBackend(
  options: LocalTenantMembersBackendOptions,
): TenantMembersBackend {
  const { data, controlPlaneTenantId, issuer } = options;

  /**
   * A tenant's org is the one whose `name` equals the tenant id. `get` resolves
   * by id then falls back to name, so pass the tenant id; still verify `name`
   * matches so an accidental id collision can't hand back the wrong team.
   */
  async function resolveOrg(tenantId: string): Promise<Organization> {
    const org = await data.organizations.get(controlPlaneTenantId, tenantId);
    if (!org || org.name !== tenantId) {
      throw new TenantOrganizationNotFoundError(tenantId);
    }
    return org;
  }

  async function findMembership(
    organizationId: string,
    userId: string,
  ): Promise<string | undefined> {
    const userOrgs = await data.userOrganizations.list(controlPlaneTenantId, {
      q: `user_id:${userId}`,
      per_page: 100,
    });
    return userOrgs.userOrganizations.find(
      (uo) => uo.organization_id === organizationId,
    )?.id;
  }

  return {
    async listMembers(
      tenantId: string,
      params: TenantMembersPageParams = {},
    ): Promise<TenantMembersListResult> {
      const org = await resolveOrg(tenantId);
      const page = params.page ?? 0;
      const per_page = params.per_page ?? 25;

      const userOrgsResult = await data.userOrganizations.list(
        controlPlaneTenantId,
        {
          page,
          per_page,
          include_totals: true,
          q: `organization_id:${org.id}`,
        },
      );

      const members = (
        await Promise.all(
          userOrgsResult.userOrganizations.map(async (userOrg) => {
            const user = await data.users.get(
              controlPlaneTenantId,
              userOrg.user_id,
            );
            if (!user) return null;
            const roles = await data.userRoles.list(
              controlPlaneTenantId,
              user.user_id,
              undefined,
              org.id,
            );
            const member: TenantMember = {
              user_id: user.user_id,
              email: user.email || undefined,
              name: user.name || undefined,
              picture: user.picture || getDefaultUserPicture(issuer, user),
              roles,
            };
            return member;
          }),
        )
      ).filter((m): m is TenantMember => m !== null);

      return {
        members,
        start: userOrgsResult.start ?? page * per_page,
        limit: userOrgsResult.limit ?? per_page,
        total: userOrgsResult.length ?? members.length,
      };
    },

    async addMembers(tenantId: string, userIds: string[]): Promise<void> {
      const org = await resolveOrg(tenantId);
      for (const userId of userIds) {
        // Only add real control-plane users — an org membership pointing at a
        // non-existent user would render as a blank row forever.
        const user = await data.users.get(controlPlaneTenantId, userId);
        if (!user) continue;
        const existing = await findMembership(org.id, userId);
        if (!existing) {
          await data.userOrganizations.create(controlPlaneTenantId, {
            user_id: userId,
            organization_id: org.id,
          });
        }
      }
    },

    async removeMembers(tenantId: string, userIds: string[]): Promise<void> {
      const org = await resolveOrg(tenantId);
      for (const userId of userIds) {
        const membershipId = await findMembership(org.id, userId);
        if (membershipId) {
          await data.userOrganizations.remove(
            controlPlaneTenantId,
            membershipId,
          );
        }
      }
    },

    async listMemberRoles(
      tenantId: string,
      userId: string,
    ): Promise<TenantRole[]> {
      const org = await resolveOrg(tenantId);
      return data.userRoles.list(
        controlPlaneTenantId,
        userId,
        undefined,
        org.id,
      );
    },

    async assignMemberRoles(
      tenantId: string,
      userId: string,
      roleIds: string[],
    ): Promise<void> {
      const org = await resolveOrg(tenantId);
      const existing = await data.userRoles.list(
        controlPlaneTenantId,
        userId,
        undefined,
        org.id,
      );
      const already = new Set(existing.map((r) => r.id));
      for (const roleId of roleIds) {
        if (already.has(roleId)) continue;
        await data.userRoles.create(
          controlPlaneTenantId,
          userId,
          roleId,
          org.id,
        );
      }
    },

    async removeMemberRoles(
      tenantId: string,
      userId: string,
      roleIds: string[],
    ): Promise<void> {
      const org = await resolveOrg(tenantId);
      for (const roleId of roleIds) {
        await data.userRoles.remove(
          controlPlaneTenantId,
          userId,
          roleId,
          org.id,
        );
      }
    },

    async listRoles(
      tenantId: string,
      params: TenantMembersPageParams = {},
    ): Promise<TenantRole[]> {
      // Assignable roles are the control-plane tenant's roles. Resolving the org
      // first keeps the "unknown tenant → 404" contract uniform across methods.
      await resolveOrg(tenantId);
      const result = await data.roles.list(controlPlaneTenantId, {
        page: params.page ?? 0,
        per_page: params.per_page ?? 100,
        q: params.q,
      });
      return result.roles;
    },

    async listInvitations(
      tenantId: string,
      params: TenantMembersPageParams = {},
    ): Promise<TenantInvitation[]> {
      const org = await resolveOrg(tenantId);
      const result = await data.invites.list(controlPlaneTenantId, {
        page: params.page ?? 0,
        per_page: params.per_page ?? 100,
      });
      return result.invites.filter(
        (invite) => invite.organization_id === org.id,
      );
    },

    async createInvitation(
      tenantId: string,
      input: TenantInvitationInput,
    ): Promise<TenantInvitation> {
      const org = await resolveOrg(tenantId);
      if (!options.invitationClientId) {
        throw new Error(
          "Cannot create invitation: no invitation client id is configured for tenant-members.",
        );
      }

      const inviteId = generateInviteId();
      const invitationUrlObj = new URL("u2/accept-invitation", issuer);
      invitationUrlObj.searchParams.set("invitation", inviteId);
      invitationUrlObj.searchParams.set("organization", org.id);
      const invitationUrl = invitationUrlObj.toString();

      const invite = await data.invites.create(controlPlaneTenantId, {
        id: inviteId,
        organization_id: org.id,
        client_id: options.invitationClientId,
        invitation_url: invitationUrl,
        invitee: input.invitee,
        inviter: input.inviter ?? {},
        roles: input.roles,
        send_invitation_email: input.send_invitation_email,
        ttl_sec: input.ttl_sec,
      });

      if (
        input.send_invitation_email !== false &&
        input.invitee.email &&
        options.sendInvitationEmail
      ) {
        try {
          await options.sendInvitationEmail({
            to: input.invitee.email,
            invitationUrl,
            inviterName: input.inviter?.name,
            organizationName: org.display_name || org.name || org.id,
            ttlSec: input.ttl_sec ?? 604800,
          });
        } catch (err) {
          console.error(
            `[tenant-members] failed to send invitation email for ${invite.id}:`,
            err,
          );
        }
      }

      return invite;
    },

    async revokeInvitation(
      tenantId: string,
      invitationId: string,
    ): Promise<void> {
      const org = await resolveOrg(tenantId);
      const invite = await data.invites.get(controlPlaneTenantId, invitationId);
      if (!invite || invite.organization_id !== org.id) {
        // Uniform "not found" — either the invite is gone or it belongs to a
        // different org (which this tenant admin must not be able to probe).
        throw new TenantInvitationNotFoundError(invitationId);
      }
      await data.invites.remove(controlPlaneTenantId, invitationId);
    },
  };
}
