import { describe, it, expect } from "vitest";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

// Driven through the full `app` (mounting the management API at /api/v2) rather
// than `managementApp` directly: the management onError deliberately rethrows
// 5xx to the parent app, so the 501/500 cases only resolve to a Response when
// the parent app's onError is in the chain.
describe("management-api POST /tenants/{id}/redeploy", () => {
  it("invokes tenantUpgrade and returns the refreshed tenant", async () => {
    const calls: string[] = [];
    const { app, env } = await getTestServer({
      tenantUpgrade: async (tenantId: string) => {
        calls.push(tenantId);
        // Simulate the hook writing the new versions back.
        await env.data.tenants.update(tenantId, {
          deployment_type: "wfp",
          worker_version: "v2.0.0",
          database_version: "0002_add_y.sql",
          provisioning_state: "ready",
        });
      },
    });

    // The fixture tenant "tenantId" is the upgrade target.
    await env.data.tenants.update("tenantId", { deployment_type: "wfp" });

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/redeploy",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(["tenantId"]);
    const body = await response.json();
    expect(body).toMatchObject({
      id: "tenantId",
      worker_version: "v2.0.0",
      database_version: "0002_add_y.sql",
      provisioning_state: "ready",
    });
  });

  it("returns 501 when no upgrade handler is configured", async () => {
    const { app, env } = await getTestServer();

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/redeploy",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(501);
  });

  it("returns 404 when the target tenant does not exist", async () => {
    const calls: string[] = [];
    const { app, env } = await getTestServer({
      tenantUpgrade: async (tenantId: string) => {
        calls.push(tenantId);
      },
    });

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/does-not-exist/redeploy",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(404);
    // The handler short-circuits before invoking the upgrade.
    expect(calls).toEqual([]);
  });

  it("surfaces a 500 when the upgrade handler throws", async () => {
    const { app, env } = await getTestServer({
      tenantUpgrade: async () => {
        throw new Error("upload failed");
      },
    });

    const token = await getAdminToken();
    const response = await app.request(
      "/api/v2/tenants/tenantId/redeploy",
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(500);
    expect(await response.text()).toContain("upload failed");
  });
});
