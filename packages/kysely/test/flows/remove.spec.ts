import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("flows", () => {
  describe("remove", () => {
    it("should remove a flow", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow = await data.flows.create("tenantId", {
        name: "Flow to Delete",
      });

      // Verify it exists
      const beforeDelete = await data.flows.get("tenantId", flow.id);
      expect(beforeDelete).not.toBeNull();

      // Remove it
      const success = await data.flows.remove("tenantId", flow.id);
      expect(success).toBe(true);

      // Verify it's gone
      const afterDelete = await data.flows.get("tenantId", flow.id);
      expect(afterDelete).toBeNull();
    });

    it("should return false when removing non-existent flow", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const success = await data.flows.remove("tenantId", "nonExistentFlow");
      expect(success).toBe(false);
    });

    it("should not remove flow from different tenant", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenant1",
        friendly_name: "Tenant 1",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      await data.tenants.create({
        id: "tenant2",
        friendly_name: "Tenant 2",
        audience: "https://example2.com",
        sender_email: "login@example2.com",
        sender_name: "SenderName2",
      });

      const flow = await data.flows.create("tenant1", {
        name: "Tenant 1 Flow",
      });

      // Try to remove from different tenant
      const success = await data.flows.remove("tenant2", flow.id);
      expect(success).toBe(false);

      // Verify it still exists in original tenant
      const stillExists = await data.flows.get("tenant1", flow.id);
      expect(stillExists).not.toBeNull();
    });

    it("should not affect other flows when removing one", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow1 = await data.flows.create("tenantId", {
        name: "Flow 1",
      });

      const flow2 = await data.flows.create("tenantId", {
        name: "Flow 2",
      });

      // Remove first flow
      await data.flows.remove("tenantId", flow1.id);

      // Verify second flow still exists
      const remaining = await data.flows.get("tenantId", flow2.id);
      expect(remaining).toMatchObject({
        id: flow2.id,
        name: "Flow 2",
      });

      // Verify list has only one flow
      const result = await data.flows.list("tenantId", {
        include_totals: true,
      });
      expect(result.flows).toHaveLength(1);
      expect(result.flows[0].id).toBe(flow2.id);
    });
  });
});
