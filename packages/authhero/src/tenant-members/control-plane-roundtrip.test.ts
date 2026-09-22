import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import {
  unquoteLuceneValue,
  type EmailServiceSendParams,
} from "@authhero/adapter-interfaces";
import { createControlPlaneClient } from "../helpers/control-plane-client";
import { createTenantMembersControlPlaneApp } from "../routes/proxy-control-plane/tenant-members";
import { createControlPlaneTenantMembersAdapter } from "./remote-backend";
import { createLocalTenantMembersBackend } from "./local-backend";
import { CONTROL_PLANE_TENANT_MEMBERS_PATH } from "./wire";
import type { AuthenticateControlPlane } from "../routes/proxy-control-plane/custom-domains";
import type { Bindings } from "../types";

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
        // Callers quote and escape the value, mirroring the real adapters.
        if (q.startsWith("organization_id:"))
          rows = userOrgs.filter(
            (r) => r.organization_id === unquoteLuceneValue(q.slice(16)),
          );
        else if (q.startsWith("user_id:"))
          rows = userOrgs.filter(
            (r) => r.user_id === unquoteLuceneValue(q.slice(8)),
          );
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

describe("tenant-members control-plane round trip: default invitation email", () => {
  /**
   * The control-plane tenant and the shard's tenant each get their own email
   * provider and branding, so the assertions can tell which one was used.
   */
  function makeEmailEnv(opts: { failSend?: boolean } = {}) {
    const cpData = makeControlPlaneData();
    const sent: EmailServiceSendParams[] = [];
    const created: string[] = [];
    const perTenant = (cp: unknown, shard: unknown) => async (t: string) =>
      t === CP ? cp : t === ACME ? shard : null;
    const data = {
      ...cpData,
      invites: {
        ...cpData.invites,
        async create(_t: string, p: { id: string }) {
          created.push(p.id);
          return { ...p };
        },
      },
      tenants: {
        get: perTenant(
          { id: CP, friendly_name: "Control Plane" },
          { id: ACME, friendly_name: "Acme Tenant" },
        ),
      },
      branding: {
        get: perTenant(
          { logo_url: "https://cp.example.com/logo.png" },
          { logo_url: "https://acme.example.com/logo.png" },
        ),
      },
      emailProviders: {
        get: perTenant(
          {
            name: "mock-email",
            credentials: { api_key: "cp-key" },
            default_from_address: "team@cp.example.com",
          },
          {
            name: "mock-email",
            credentials: { api_key: "acme-key" },
            default_from_address: "login@acme.example.com",
          },
        ),
      },
      emailTemplates: { get: async () => null },
      emailService: {
        async send(params: EmailServiceSendParams) {
          if (opts.failSend) throw new Error("provider down");
          sent.push(params);
        },
      },
    };
    // Deliberately partial: only what the invitation path reads.
    const env = {
      data,
      ISSUER: "https://cp.example.com/",
    } as unknown as Bindings;
    return { env, sent, created };
  }

  /** The control-plane resource wired the documented way: `ctx: c`. */
  function makeRemoteWithEmail(
    env: Bindings,
    overrides: Record<string, unknown> = {},
  ) {
    const root = new Hono<{ Bindings: Bindings }>();
    root.route(
      CONTROL_PLANE_TENANT_MEMBERS_PATH,
      createTenantMembersControlPlaneApp({
        getBackend: (c) =>
          createLocalTenantMembersBackend({
            data: c.env.data,
            controlPlaneTenantId: CP,
            issuer: "https://cp.example.com/",
            invitationClientId: "invite-client",
            ctx: c,
            ...overrides,
          }),
        authenticate,
      }),
    );
    return makeRemote({ fetch: (req) => root.fetch(req, env) });
  }

  it("sends the user_invitation email as the control-plane tenant", async () => {
    const { env, sent } = makeEmailEnv();
    const invite = await makeRemoteWithEmail(env).createInvitation(ACME, {
      invitee: { email: "new@acme.com" },
      inviter: { name: "Ann" },
    });

    expect(sent).toHaveLength(1);
    const [email] = sent;
    if (!email) throw new Error("no email sent");
    expect(email.to).toBe("new@acme.com");
    expect(email.template).toBe("auth-invitation");
    expect(email.emailProvider.credentials.api_key).toBe("cp-key");
    expect(email.from).toBe("team@cp.example.com");
    expect(email.data.tenantId).toBe(CP);
    expect(email.data.logo).toBe("https://cp.example.com/logo.png");
    expect(email.data.organizationName).toBe("Acme");
    expect(email.data.invitationUrl).toBe(invite.invitation_url);
  });

  it("sends nothing when send_invitation_email is false", async () => {
    const { env, sent, created } = makeEmailEnv();
    await makeRemoteWithEmail(env).createInvitation(ACME, {
      invitee: { email: "new@acme.com" },
      send_invitation_email: false,
    });
    expect(created).toHaveLength(1);
    expect(sent).toHaveLength(0);
  });

  it("uses a host-supplied sendInvitationEmail instead of the default", async () => {
    const { env, sent } = makeEmailEnv();
    const sendInvitationEmail = vi.fn(async () => {});
    await makeRemoteWithEmail(env, { sendInvitationEmail }).createInvitation(
      ACME,
      { invitee: { email: "new@acme.com" } },
    );
    expect(sendInvitationEmail).toHaveBeenCalledOnce();
    expect(sent).toHaveLength(0);
  });

  it("still creates the invitation when delivery fails", async () => {
    const { env, created } = makeEmailEnv({ failSend: true });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const invite = await makeRemoteWithEmail(env).createInvitation(ACME, {
        invitee: { email: "new@acme.com" },
      });
      expect(created).toEqual([invite.id]);
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining("[tenant-members] failed to send invitation"),
        expect.anything(),
      );
    } finally {
      errors.mockRestore();
    }
  });
});

describe("tenant-members control-plane resource: default authentication", () => {
  it("rejects a request without a control-plane bearer token when no authenticate is passed", async () => {
    const root = new Hono();
    root.route(
      CONTROL_PLANE_TENANT_MEMBERS_PATH,
      createTenantMembersControlPlaneApp({
        getBackend: () => {
          throw new Error("backend must not be reached");
        },
      }),
    );
    const env = { ISSUER: "https://cp.example.com/" };
    const unauthenticated = await root.fetch(
      new Request(`http://cp${CONTROL_PLANE_TENANT_MEMBERS_PATH}/members`),
      env,
    );
    expect(unauthenticated.status).toBe(401);
    const forged = await root.fetch(
      new Request(`http://cp${CONTROL_PLANE_TENANT_MEMBERS_PATH}/members`, {
        headers: { authorization: `Bearer tok::${ACME}` },
      }),
      env,
    );
    expect(forged.status).toBe(401);
  });
});
