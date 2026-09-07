import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant } from "../../helpers/seed-tenant";

// The settings payloads themselves are covered by settings.spec.ts; this file
// covers the parts of the tenants module around them — the `is_control_plane`
// flag the routes add to every response, and the missing-tenant path.
describe("management-api tenants", () => {
  async function setup() {
    const { app, managementApp, env } = await getTestServer();
    return {
      app,
      env,
      managementClient: testClient(managementApp, env),
      token: await getAdminToken(),
    };
  }

  describe("GET /api/v2/tenants/settings", () => {
    it("marks the tenant as the control plane when no control plane is configured", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.tenants.settings.$get(
        { header: { "tenant-id": "tenantId" } },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        id: "tenantId",
        is_control_plane: true,
      });
    });

    it("marks the tenant as not the control plane when another tenant is", async () => {
      const { env, managementClient, token } = await setup();
      env.data.multiTenancyConfig = { controlPlaneTenantId: "control_plane" };

      const response = await managementClient.tenants.settings.$get(
        { header: { "tenant-id": "tenantId" } },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: "tenantId",
        is_control_plane: false,
      });
    });

    it("returns the settings of the tenant named by the header, not another tenant's", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");
      await env.data.tenants.update("otherTenant", {
        friendly_name: "Other Tenant",
      });

      const response = await managementClient.tenants.settings.$get(
        { header: { "tenant-id": "otherTenant" } },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: "otherTenant",
        friendly_name: "Other Tenant",
      });
    });

    it("returns 404 when the tenant does not exist", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.tenants.settings.$get(
        { header: { "tenant-id": "does-not-exist" } },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/v2/tenants/settings", () => {
    it("carries the control-plane flag on the updated settings", async () => {
      const { env, managementClient, token } = await setup();
      env.data.multiTenancyConfig = { controlPlaneTenantId: "tenantId" };

      const response = await managementClient.tenants.settings.$patch(
        {
          json: { friendly_name: "Renamed Tenant" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        friendly_name: "Renamed Tenant",
        is_control_plane: true,
      });
    });

    it("ignores an id in the body instead of renaming the tenant", async () => {
      const { env, managementClient, token } = await setup();

      const response = await managementClient.tenants.settings.$patch(
        {
          json: { id: "hijacked", friendly_name: "Renamed Tenant" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        id: "tenantId",
        friendly_name: "Renamed Tenant",
      });
      expect(await env.data.tenants.get("hijacked")).toBeNull();
    });

    it("does not accept database_version, which the provisioner owns", async () => {
      const { app, env, token } = await setup();
      const before = await env.data.tenants.get("tenantId");

      const response = await app.request(
        "/api/v2/tenants/settings",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ database_version: "0099_hijack.sql" }),
        },
        env,
      );

      expect(response.status).toBe(200);
      const tenant = await env.data.tenants.get("tenantId");
      expect(tenant?.database_version).toBe(before?.database_version);
    });

    it("returns 404 when the tenant does not exist", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient.tenants.settings.$patch(
        {
          json: { friendly_name: "Renamed Tenant" },
          header: { "tenant-id": "does-not-exist" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });
});
