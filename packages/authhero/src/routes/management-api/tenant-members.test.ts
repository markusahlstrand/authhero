import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { createTenantMembersRoutes } from "./tenant-members";
import type { TenantMembersBackend } from "../../tenant-members/types";

function recordingBackend(): TenantMembersBackend {
  return {
    listMembers: vi.fn(async () => ({
      members: [],
      start: 0,
      limit: 25,
      total: 0,
    })),
    addMembers: vi.fn(async () => {}),
    removeMembers: vi.fn(async () => {}),
    listMemberRoles: vi.fn(async () => []),
    assignMemberRoles: vi.fn(async () => {}),
    removeMemberRoles: vi.fn(async () => {}),
    listRoles: vi.fn(async () => []),
    listInvitations: vi.fn(async () => []),
    createInvitation: vi.fn(async () => ({}) as never),
    revokeInvitation: vi.fn(async () => {}),
  };
}

/**
 * Mount the routes behind a middleware that injects the token-derived vars the
 * real auth middleware would set, so we can exercise the org-claim pin without
 * a full JWT/data-adapter harness.
 */
function makeApp(
  vars: { tenant_id?: string; org_name?: string },
  backend: TenantMembersBackend,
) {
  const app = new Hono();
  app.use(async (c, next) => {
    if (vars.tenant_id) c.set("tenant_id" as never, vars.tenant_id as never);
    if (vars.org_name) c.set("org_name" as never, vars.org_name as never);
    await next();
  });
  app.route(
    "/tenant-members",
    createTenantMembersRoutes(() => backend),
  );
  return app;
}

describe("/api/v2/tenant-members org-claim pin", () => {
  it("delegates when org_name matches the tenant", async () => {
    const backend = recordingBackend();
    const app = makeApp({ tenant_id: "acme", org_name: "acme" }, backend);
    const res = await app.fetch(new Request("http://x/tenant-members"));
    expect(res.status).toBe(200);
    expect(backend.listMembers).toHaveBeenCalledWith(
      "acme",
      expect.any(Object),
    );
  });

  it("matches org_name case-insensitively", async () => {
    const backend = recordingBackend();
    const app = makeApp({ tenant_id: "acme", org_name: "ACME" }, backend);
    const res = await app.fetch(new Request("http://x/tenant-members"));
    expect(res.status).toBe(200);
  });

  it("forbids a token whose org_name is a different tenant", async () => {
    const backend = recordingBackend();
    const app = makeApp({ tenant_id: "acme", org_name: "evil" }, backend);
    const res = await app.fetch(new Request("http://x/tenant-members"));
    expect(res.status).toBe(403);
    expect(backend.listMembers).not.toHaveBeenCalled();
  });

  it("forbids a token with no org_name (e.g. a plain control-plane token)", async () => {
    const backend = recordingBackend();
    const app = makeApp({ tenant_id: "acme" }, backend);
    const res = await app.fetch(new Request("http://x/tenant-members"));
    expect(res.status).toBe(403);
  });

  it("pins writes too — a mismatched org_name cannot invite", async () => {
    const backend = recordingBackend();
    const app = makeApp({ tenant_id: "acme", org_name: "evil" }, backend);
    const res = await app.fetch(
      new Request("http://x/tenant-members/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitee: { email: "x@acme.com" } }),
      }),
    );
    expect(res.status).toBe(403);
    expect(backend.createInvitation).not.toHaveBeenCalled();
  });
});
