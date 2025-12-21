import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("flows", () => {
  describe("update", () => {
    it("should update a flow's basic properties", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow = await data.flows.create("tenantId", {
        name: "Original Flow",
      });

      const updatedFlow = await data.flows.update("tenantId", flow.id, {
        name: "Updated Flow",
      });

      expect(updatedFlow).not.toBeNull();
      expect(updatedFlow).toMatchObject({
        id: flow.id,
        name: "Updated Flow",
      });
    });

    it("should add action steps to an existing flow", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow = await data.flows.create("tenantId", {
        name: "Empty Flow",
      });

      const updatedFlow = await data.flows.update("tenantId", flow.id, {
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

      expect(updatedFlow).not.toBeNull();
      expect(updatedFlow?.actions).toHaveLength(1);
      expect(updatedFlow?.actions[0]).toMatchObject({
        id: "step-1",
        type: "EMAIL",
        action: "VERIFY_EMAIL",
      });
    });

    it("should return null when updating non-existent flow", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const result = await data.flows.update("tenantId", "nonExistentFlow", {
        name: "Should Not Work",
      });

      expect(result).toBeNull();
    });

    it("should replace action steps completely", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow = await data.flows.create("tenantId", {
        name: "Multi-step Flow",
        actions: [
          {
            id: "step-1",
            type: "EMAIL" as const,
            action: "VERIFY_EMAIL" as const,
            params: {
              email: "test@example.com",
            },
          },
          {
            id: "step-2",
            type: "AUTH0" as const,
            action: "UPDATE_USER" as const,
            params: {
              user_id: "user123",
              changes: { email: "new@example.com" },
            },
          },
        ],
      });

      // Replace with different action
      const updatedFlow = await data.flows.update("tenantId", flow.id, {
        actions: [
          {
            id: "new-step-1",
            type: "AUTH0" as const,
            action: "UPDATE_USER" as const,
            params: {
              user_id: "user456",
              changes: { name: "New Name" },
            },
          },
        ],
      });

      expect(updatedFlow).not.toBeNull();
      expect(updatedFlow?.actions).toHaveLength(1);
      expect(updatedFlow?.actions[0]).toMatchObject({
        id: "new-step-1",
        type: "AUTH0",
        action: "UPDATE_USER",
      });
    });
  });
});
