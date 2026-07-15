import { HTTPException } from "hono/http-exception";
import {
  ControlPlaneClient,
  ControlPlaneResponse,
} from "../helpers/control-plane-client";
import { CONTROL_PLANE_TENANT_MEMBERS_SCOPE } from "../routes/proxy-control-plane/scopes";
import {
  TenantInvitation,
  TenantInvitationInput,
  TenantMembersBackend,
  TenantMembersListResult,
  TenantMembersPageParams,
  TenantOrganizationNotFoundError,
  TenantRole,
  tenantMembersListSchema,
} from "./types";
import { CONTROL_PLANE_TENANT_MEMBERS_PATH } from "./wire";

export interface ControlPlaneTenantMembersOptions {
  /** Authed transport to the control plane (shared with other adapters). */
  client: ControlPlaneClient;
  /** Override the control-plane resource path (tests, custom mounts). */
  basePath?: string;
}

function errorMessage(data: unknown, fallback: string): string {
  if (data !== null && typeof data === "object") {
    const body = data as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  }
  return fallback;
}

/**
 * Map a non-2xx control-plane response onto an exception. A 4xx passes through
 * with its status; anything else is a 502 — the shard is fine, its upstream is
 * not. 404 is handled by callers (it means "no team / not found"), so it never
 * reaches here.
 */
function toHttpException(
  response: ControlPlaneResponse,
  action: string,
): HTTPException {
  const message = errorMessage(
    response.data,
    `Control plane failed to ${action} (status ${response.status})`,
  );
  if (response.status >= 400 && response.status < 500) {
    return new HTTPException(response.status as 400, { message });
  }
  return new HTTPException(502, { message });
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

/**
 * A `TenantMembersBackend` for a tenant shard whose own database does not hold
 * the control-plane organization that models its team. Every call is delegated
 * up to the authoritative `tenant-members` resource
 * (`createTenantMembersControlPlaneApp`) over the shared control-plane client,
 * which mints a service token bound to this tenant. The control plane pins the
 * org from that token, so the shard never has to (and cannot) name it.
 */
export function createControlPlaneTenantMembersAdapter(
  options: ControlPlaneTenantMembersOptions,
): TenantMembersBackend {
  const { client } = options;
  const basePath = options.basePath ?? CONTROL_PLANE_TENANT_MEMBERS_PATH;
  const scope = CONTROL_PLANE_TENANT_MEMBERS_SCOPE;

  return {
    async listMembers(
      tenantId: string,
      params: TenantMembersPageParams = {},
    ): Promise<TenantMembersListResult> {
      const response = await client.request({
        tenantId,
        scope,
        method: "GET",
        path: `${basePath}/members${query({
          tenant_id: tenantId,
          page: params.page,
          per_page: params.per_page,
          q: params.q,
        })}`,
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 200) {
        throw toHttpException(response, "list tenant members");
      }
      const parsed = tenantMembersListSchema.safeParse(response.data);
      if (!parsed.success) {
        throw new HTTPException(502, {
          message: "Control plane returned an unparseable member list",
        });
      }
      return parsed.data;
    },

    async addMembers(tenantId: string, userIds: string[]): Promise<void> {
      const response = await client.request({
        tenantId,
        scope,
        method: "POST",
        path: `${basePath}/members`,
        body: { tenant_id: tenantId, user_ids: userIds },
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 204 && response.status !== 200) {
        throw toHttpException(response, "add tenant members");
      }
    },

    async removeMembers(tenantId: string, userIds: string[]): Promise<void> {
      const response = await client.request({
        tenantId,
        scope,
        method: "DELETE",
        path: `${basePath}/members`,
        body: { tenant_id: tenantId, user_ids: userIds },
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 204 && response.status !== 200) {
        throw toHttpException(response, "remove tenant members");
      }
    },

    async listMemberRoles(
      tenantId: string,
      userId: string,
    ): Promise<TenantRole[]> {
      const response = await client.request({
        tenantId,
        scope,
        method: "GET",
        path: `${basePath}/members/${encodeURIComponent(userId)}/roles${query({ tenant_id: tenantId })}`,
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 200) {
        throw toHttpException(response, "list member roles");
      }
      return (response.data as TenantRole[]) ?? [];
    },

    async assignMemberRoles(
      tenantId: string,
      userId: string,
      roleIds: string[],
    ): Promise<void> {
      const response = await client.request({
        tenantId,
        scope,
        method: "POST",
        path: `${basePath}/members/${encodeURIComponent(userId)}/roles`,
        body: { tenant_id: tenantId, roles: roleIds },
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 204 && response.status !== 200) {
        throw toHttpException(response, "assign member roles");
      }
    },

    async removeMemberRoles(
      tenantId: string,
      userId: string,
      roleIds: string[],
    ): Promise<void> {
      const response = await client.request({
        tenantId,
        scope,
        method: "DELETE",
        path: `${basePath}/members/${encodeURIComponent(userId)}/roles`,
        body: { tenant_id: tenantId, roles: roleIds },
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 204 && response.status !== 200) {
        throw toHttpException(response, "remove member roles");
      }
    },

    async listRoles(
      tenantId: string,
      params: TenantMembersPageParams = {},
    ): Promise<TenantRole[]> {
      const response = await client.request({
        tenantId,
        scope,
        method: "GET",
        path: `${basePath}/roles${query({
          tenant_id: tenantId,
          page: params.page,
          per_page: params.per_page,
          q: params.q,
        })}`,
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 200) {
        throw toHttpException(response, "list assignable roles");
      }
      return (response.data as TenantRole[]) ?? [];
    },

    async listInvitations(
      tenantId: string,
      params: TenantMembersPageParams = {},
    ): Promise<TenantInvitation[]> {
      const response = await client.request({
        tenantId,
        scope,
        method: "GET",
        path: `${basePath}/invitations${query({
          tenant_id: tenantId,
          page: params.page,
          per_page: params.per_page,
        })}`,
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 200) {
        throw toHttpException(response, "list invitations");
      }
      return (response.data as TenantInvitation[]) ?? [];
    },

    async createInvitation(
      tenantId: string,
      input: TenantInvitationInput,
    ): Promise<TenantInvitation> {
      const response = await client.request({
        tenantId,
        scope,
        method: "POST",
        path: `${basePath}/invitations`,
        body: { tenant_id: tenantId, ...input },
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 201 && response.status !== 200) {
        throw toHttpException(response, "create invitation");
      }
      return response.data as TenantInvitation;
    },

    async revokeInvitation(
      tenantId: string,
      invitationId: string,
    ): Promise<void> {
      const response = await client.request({
        tenantId,
        scope,
        method: "DELETE",
        path: `${basePath}/invitations/${encodeURIComponent(invitationId)}${query({ tenant_id: tenantId })}`,
      });
      if (response.status === 404) {
        throw new TenantOrganizationNotFoundError(tenantId);
      }
      if (response.status !== 204 && response.status !== 200) {
        throw toHttpException(response, "revoke invitation");
      }
    },
  };
}
