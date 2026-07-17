import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { createControlPlaneClient } from "../helpers/control-plane-client";
import { createTenantMembersControlPlaneApp } from "../routes/proxy-control-plane/tenant-members";
import { createControlPlaneTenantMembersAdapter } from "./remote-backend";
import { createLocalTenantMembersBackend } from "./local-backend";
import { CONTROL_PLANE_TENANT_MEMBERS_PATH } from "./wire";
import type { AuthenticateControlPlane } from "../routes/proxy-control-plane/custom-domains";

const CP = "control-plane";
const ACME = "acme";
const EVIL = "evil";

// The service token stands in for a real JWT: its embedded tenant is the
// `tenant_id` claim the control plane pins on. `tok::<tenant>`.
type Fetchable = { fetch(req: Request): Response | Promise<Response> };

const authenticate: AuthenticateControlPlane = async (c) => {
  const header = c.req.raw.headers.get("authorization") ?? "";
  const match = /^Bearer\s+tok::(.*)$/.exec(header);
  if (!match) return { ok: false, reason: "bad token" };
  const tenant = match[1] ?? "";
  return { ok: true, tenantId: tenant || undefined };
};

/** Minimal control-plane adapters, seeded with acme's org + one user + role. */
function makeControlPlaneData() {
  const users = new Map<string, any>([
    ["u1", { user_id: "u1", email: "a@acme.com", name: "Ann" }],
  ]);
  const roles = new Map<string, any>([
    ["role_admin", { id: "role_admin", name: "Tenant Admin" }],
  ]);
  const organizations = new Map<string, any>([
    ["org_acme", { id: "org_acme", name: ACME, display_name: "Acme" }],
  ]);
  const userOrgs: any[] = [];
  const userRoles: any[] = [];
  let seq = 0;

  return {
    organizations: {
      async get(_t: string, id: string) {
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
        if (q.startsWith("organization_id:"))
          rows = userOrgs.filter((r) => r.organization_id === q.slice(16));
        else if (q.startsWith("user_id:"))
          rows = userOrgs.filter((r) => r.user_id === q.slice(8));
        return {
          userOrganizations: rows,
          start: 0,
          limit: 100,
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
        if (i >= 0) userOrgs.splice(i, 1);
        return i >= 0;
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
      async create(_t: string, u: string, r: string, o?: string) {
        userRoles.push({ user_id: u, role_id: r, organization_id: o ?? "" });
        return true;
      },
      async remove() {
        return true;
      },
    },
    invites: {
      async list() {
        return { invites: [], start: 0, limit: 100, length: 0 };
      },
      async get() {
        return null;
      },
      async create(_t: string, p: any) {
        return { ...p };
      },
      async remove() {
        return true;
      },
    },
  } as any;
}

/** Wire a remote adapter whose transport dispatches into the control-plane app. */
function makeRemote(app: Fetchable) {
  const client = createControlPlaneClient({
    baseUrl: "https://cp.example.com",
    getServiceToken: async (tenantId) => `tok::${tenantId}`,
    fetchImpl: async (input, init) => {
      // Rewrite onto the app; only the path matters to the Hono router.
      const url = typeof input === "string" ? input : new Request(input).url;
      const path = url.replace("https://cp.example.com", "");
      return app.fetch(new Request(`http://cp${path}`, init ?? undefined));
    },
  });
  return createControlPlaneTenantMembersAdapter({ client });
}

function makeApp(data = makeControlPlaneData()) {
  const backend = createLocalTenantMembersBackend({
    data,
    controlPlaneTenantId: CP,
    issuer: "https://cp.example.com/",
    invitationClientId: "invite-client",
  });
  // Mount at the real base path so the remote adapter's paths line up.
  const root = new Hono();
  root.route(
    CONTROL_PLANE_TENANT_MEMBERS_PATH,
    createTenantMembersControlPlaneApp({
      getBackend: () => backend,
      authenticate,
    }),
  );
  return { app: root, data };
}

describe("tenant-members control-plane round trip", () => {
  let app: Fetchable;
  beforeEach(() => {
    app = makeApp().app;
  });

  it("delegates a full add → list cycle, pinned to the token's tenant", async () => {
    const remote = makeRemote(app);
    await remote.addMembers(ACME, ["u1"]);
    await remote.assignMemberRoles(ACME, "u1", ["role_admin"]);

    const result = await remote.listMembers(ACME);
    expect(result.members.map((m) => m.user_id)).toEqual(["u1"]);
    expect(result.members[0]?.roles.map((r) => r.id)).toEqual(["role_admin"]);
  });

  it("rejects a body that names a tenant other than the token's (no cross-tenant writes)", async () => {
    // Token is for acme, but the body claims evil. The control plane must 403,
    // NOT act on acme silently and NOT act on evil.
    const res = await app.fetch(
      new Request(`http://cp${CONTROL_PLANE_TENANT_MEMBERS_PATH}/members`, {
        method: "POST",
        headers: {
          authorization: `Bearer tok::${ACME}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenant_id: EVIL, user_ids: ["u1"] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects a mismatched tenant_id query on reads", async () => {
    const res = await app.fetch(
      new Request(
        `http://cp${CONTROL_PLANE_TENANT_MEMBERS_PATH}/members?tenant_id=${EVIL}`,
        { headers: { authorization: `Bearer tok::${ACME}` } },
      ),
    );
    expect(res.status).toBe(403);
  });

  it("fails closed for a token that carries no tenant binding", async () => {
    const res = await app.fetch(
      new Request(`http://cp${CONTROL_PLANE_TENANT_MEMBERS_PATH}/members`, {
        headers: { authorization: "Bearer tok::" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await app.fetch(
      new Request(`http://cp${CONTROL_PLANE_TENANT_MEMBERS_PATH}/members`),
    );
    expect(res.status).toBe(401);
  });

  it("surfaces a missing organization as a not-found", async () => {
    const remote = makeRemote(app);
    // 'ghost' has no org; the token is minted for ghost, the control plane
    // resolves no org and returns 404, which the adapter maps to the typed
    // not-found error.
    await expect(remote.listMembers("ghost")).rejects.toThrow(
      /no organization/i,
    );
  });
});
