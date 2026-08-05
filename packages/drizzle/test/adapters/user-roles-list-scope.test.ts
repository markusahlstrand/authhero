import { describe, it, expect, beforeEach } from "vitest";
import { getTestServer } from "../helpers/test-server";

// Regression for #1198: userRoles.list must honor the organization scope
// exactly like the Kysely adapter.
//   undefined -> roles across every organization scope
//   ""        -> global / tenant-level roles only
//   "<id>"    -> that organization's roles only
// Guarding on truthiness instead of `!== undefined` used to make "" (global)
// fall through to "all scopes", leaking org-scoped roles into global lookups.
describe("userRoles.list organization scope semantics", () => {
  let data: ReturnType<typeof getTestServer>["data"];
  const tenantId = "t1";
  const userId = "user-1";
  let globalRoleId: string;
  let orgRoleId: string;

  beforeEach(async () => {
    const server = getTestServer();
    data = server.data;

    await data.tenants.create({ id: tenantId, name: "Tenant 1" });

    const globalRole = await data.roles.create(tenantId, {
      name: "global-role",
      description: "Assigned globally",
    });
    globalRoleId = globalRole.id;

    const orgRole = await data.roles.create(tenantId, {
      name: "org-role",
      description: "Assigned in org-a",
    });
    orgRoleId = orgRole.id;

    // Global assignment (organization_id = "").
    await data.userRoles.create(tenantId, userId, globalRoleId, "");
    // Org-scoped assignment.
    await data.userRoles.create(tenantId, userId, orgRoleId, "org-a");
  });

  it('returns only global roles for organization_id ""', async () => {
    const roles = await data.userRoles.list(tenantId, userId, undefined, "");
    const ids = roles.map((r) => r.id);
    expect(ids).toContain(globalRoleId);
    expect(ids).not.toContain(orgRoleId);
  });

  it("returns only that organization's roles for a concrete id", async () => {
    const roles = await data.userRoles.list(
      tenantId,
      userId,
      undefined,
      "org-a",
    );
    const ids = roles.map((r) => r.id);
    expect(ids).toContain(orgRoleId);
    expect(ids).not.toContain(globalRoleId);
  });

  it("returns roles across every scope for undefined organization_id", async () => {
    const roles = await data.userRoles.list(tenantId, userId);
    const ids = roles.map((r) => r.id);
    expect(ids).toContain(globalRoleId);
    expect(ids).toContain(orgRoleId);
  });
});
