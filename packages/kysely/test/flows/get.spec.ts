import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("flows", () => {
  describe("get", () => {
    it("should retrieve a specific flow by ID", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const { id } = await data.flows.create("tenantId", {
        name: "Test Flow",
      });

      const flow = await data.flows.get("tenantId", id);

      expect(flow).toMatchObject({
        id,
        name: "Test Flow",
        actions: [],
      });
    });

    it("should return null when flow does not exist", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow = await data.flows.get("tenantId", "nonExistentFlow");
      expect(flow).toBeNull();
    });

    it("should retrieve flow with action steps", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const { id } = await data.flows.create("tenantId", {
        name: "Email Verification",
        actions: [
          {
            id: "step-1",
            type: "EMAIL" as const,
            action: "VERIFY_EMAIL" as const,
            params: {
              email: "test@example.com",
            },
          },
        ],
      });

      const flow = await data.flows.get("tenantId", id);

      expect(flow).toMatchObject({
        id,
        name: "Email Verification",
        actions: [
          {
            id: "step-1",
            type: "EMAIL",
            action: "VERIFY_EMAIL",
          },
        ],
      });
    });

    it("should not return flow from different tenant", async () => {
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

      const { id } = await data.flows.create("tenant1", {
        name: "Tenant 1 Flow",
      });

      // Try to get flow from different tenant
      const flow = await data.flows.get("tenant2", id);
      expect(flow).toBeNull();
    });
  });
});
