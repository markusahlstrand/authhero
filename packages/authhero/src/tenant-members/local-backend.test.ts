import { describe, it, expect, beforeEach } from "vitest";
import { createLocalTenantMembersBackend } from "./local-backend";
import {
  TenantInvitationNotFoundError,
  TenantOrganizationNotFoundError,
} from "./types";

const CP = "control-plane"; // control-plane tenant id
const TENANT = "acme"; // child tenant id == org name

/**
 * A tiny in-memory stand-in for the six control-plane adapters the backend
 * touches. Only the methods the backend calls are implemented.
 */
function makeData() {
  const organizations = new Map<string, any>();
  const users = new Map<string, any>();
  const roles = new Map<string, any>();
  const userOrgs: any[] = [];
  const userRoles: any[] = []; // { user_id, role_id, organization_id }
  const invites = new Map<string, any>();
  let seq = 0;

  organizations.set("org_acme", {
    id: "org_acme",
    name: TENANT,
    display_name: "Acme",
  });

  const data = {
    organizations: {
      async get(_t: string, id: string) {
        // id-or-name resolution, matching the real adapter.
        return (
          organizations.get(id) ??
          [...organizations.values()].find((o) => o.name === id) ??
          null
        );
      },
    },
    users: {
      async get(_t: string, id: string) {
        return users.get(id) ?? null;
      },
    },
    roles: {
      async get(_t: string, id: string) {
        return roles.get(id) ?? null;
      },
      async list() {
        return {
          roles: [...roles.values()],
          start: 0,
          limit: 100,
          length: roles.size,
        };
      },
    },
    userOrganizations: {
      async list(_t: string, params: any) {
        const q = params?.q ?? "";
        let rows = userOrgs;
        if (q.startsWith("organization_id:")) {
          const id = q.slice("organization_id:".length);
          rows = userOrgs.filter((r) => r.organization_id === id);
        } else if (q.startsWith("user_id:")) {
          const id = q.slice("user_id:".length);
          rows = userOrgs.filter((r) => r.user_id === id);
        }
        return {
          userOrganizations: rows,
          start: 0,
          limit: params?.per_page ?? 25,
          length: rows.length,
        };
      },
      async create(_t: string, params: any) {
        const row = { id: `uo_${++seq}`, ...params };
        userOrgs.push(row);
        return row;
      },
      async remove(_t: string, id: string) {
        const i = userOrgs.findIndex((r) => r.id === id);
        if (i === -1) return false;
        userOrgs.splice(i, 1);
        return true;
      },
    },
    userRoles: {
      async list(_t: string, userId: string, _p: any, orgId?: string) {
        return userRoles
          .filter(
            (r) => r.user_id === userId && r.organization_id === (orgId ?? ""),
          )
          .map((r) => roles.get(r.role_id))
          .filter(Boolean);
      },
      async create(
        _t: string,
        userId: string,
        roleId: string,
        orgId?: string,
      ) {
        userRoles.push({
          user_id: userId,
          role_id: roleId,
          organization_id: orgId ?? "",
        });
        return true;
      },
      async remove(
        _t: string,
        userId: string,
        roleId: string,
        orgId?: string,
      ) {
        const i = userRoles.findIndex(
          (r) =>
            r.user_id === userId &&
            r.role_id === roleId &&
            r.organization_id === (orgId ?? ""),
        );
        if (i === -1) return false;
        userRoles.splice(i, 1);
        return true;
      },
    },
    invites: {
      async list() {
        return {
          invites: [...invites.values()],
          start: 0,
          limit: 100,
          length: invites.size,
        };
      },
      async get(_t: string, id: string) {
        return invites.get(id) ?? null;
      },
      async create(_t: string, params: any) {
        const row = {
          created_at: "2026-01-01T00:00:00.000Z",
          expires_at: "2026-01-08T00:00:00.000Z",
          ...params,
        };
        invites.set(params.id, row);
        return row;
      },
      async remove(_t: string, id: string) {
        return invites.delete(id);
      },
    },
  };

  return {
    data: data as any,
    seed: {
      addUser: (u: any) => users.set(u.user_id, u),
      addRole: (r: any) => roles.set(r.id, r),
      addOrg: (o: any) => organizations.set(o.id, o),
    },
    peek: { userOrgs, userRoles, invites },
  };
}

function makeBackend(overrides: Record<string, unknown> = {}) {
  const fx = makeData();
  const backend = createLocalTenantMembersBackend({
    data: fx.data,
    controlPlaneTenantId: CP,
    issuer: "https://cp.example.com/",
    invitationClientId: "invite-client",
    ...overrides,
  });
  return { backend, ...fx };
}

describe("local tenant-members backend", () => {
  let fx: ReturnType<typeof makeBackend>;
  beforeEach(() => {
    fx = makeBackend();
    fx.seed.addRole({ id: "role_admin", name: "Tenant Admin" });
    fx.seed.addRole({ id: "role_view", name: "Viewer" });
    fx.seed.addUser({ user_id: "u1", email: "a@acme.com", name: "Ann" });
  });

  it("throws not-found for a tenant with no organization", async () => {
    await expect(fx.backend.listMembers("nope")).rejects.toBeInstanceOf(
      TenantOrganizationNotFoundError,
    );
  });

  it("lists members with their org-scoped roles", async () => {
    await fx.backend.addMembers(TENANT, ["u1"]);
    await fx.backend.assignMemberRoles(TENANT, "u1", ["role_admin"]);

    const result = await fx.backend.listMembers(TENANT);
    expect(result.members).toHaveLength(1);
    expect(result.members[0]).toMatchObject({
      user_id: "u1",
      email: "a@acme.com",
    });
    expect(result.members[0]?.roles.map((r) => r.id)).toEqual(["role_admin"]);
  });

  it("does not add the same member twice, and skips unknown users", async () => {
    await fx.backend.addMembers(TENANT, ["u1", "u1", "ghost"]);
    expect(fx.peek.userOrgs).toHaveLength(1);
    expect(fx.peek.userOrgs[0].user_id).toBe("u1");
  });

  it("assign roles is idempotent", async () => {
    await fx.backend.addMembers(TENANT, ["u1"]);
    await fx.backend.assignMemberRoles(TENANT, "u1", ["role_admin"]);
    await fx.backend.assignMemberRoles(TENANT, "u1", ["role_admin", "role_view"]);
    const roles = await fx.backend.listMemberRoles(TENANT, "u1");
    expect(roles.map((r) => r.id).sort()).toEqual(["role_admin", "role_view"]);
  });

  it("removes a member", async () => {
    await fx.backend.addMembers(TENANT, ["u1"]);
    await fx.backend.removeMembers(TENANT, ["u1"]);
    const result = await fx.backend.listMembers(TENANT);
    expect(result.members).toHaveLength(0);
  });

  it("creates an invitation scoped to the tenant's org and lists only its own", async () => {
    // An invitation on a different org must not leak into this tenant's list.
    fx.seed.addOrg({ id: "org_other", name: "other" });
    await fx.data.invites.create(CP, {
      id: "inv_other",
      organization_id: "org_other",
      invitee: { email: "x@other.com" },
    });

    const invite = await fx.backend.createInvitation(TENANT, {
      invitee: { email: "new@acme.com" },
      inviter: { name: "Ann" },
      send_invitation_email: false,
    });
    expect(invite.organization_id).toBe("org_acme");
    expect(invite.invitation_url).toContain("organization=org_acme");

    const list = await fx.backend.listInvitations(TENANT);
    expect(list.map((i) => i.id)).toEqual([invite.id]);
  });

  it("refuses to create an invitation without a configured client id", async () => {
    const { backend } = makeBackend({ invitationClientId: undefined });
    await expect(
      backend.createInvitation(TENANT, { invitee: { email: "x@acme.com" } }),
    ).rejects.toThrow(/invitation client id/i);
  });

  it("revoking an invitation from another org is a not-found, not a delete", async () => {
    fx.seed.addOrg({ id: "org_other", name: "other" });
    await fx.data.invites.create(CP, {
      id: "inv_other",
      organization_id: "org_other",
      invitee: { email: "x@other.com" },
    });
    await expect(
      fx.backend.revokeInvitation(TENANT, "inv_other"),
    ).rejects.toBeInstanceOf(TenantInvitationNotFoundError);
    expect(fx.peek.invites.has("inv_other")).toBe(true);
  });
});
