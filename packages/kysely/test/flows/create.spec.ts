import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("flows", () => {
  describe("create", () => {
    it("should create a flow with basic fields", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const createdFlow = await data.flows.create("tenantId", {
        name: "Basic Flow",
      });

      expect(createdFlow).toMatchObject({
        id: expect.any(String),
        name: "Basic Flow",
        actions: [],
      });

      // Verify the flow was actually created by retrieving it
      const retrievedFlow = await data.flows.get("tenantId", createdFlow.id);
      expect(retrievedFlow).toMatchObject({
        id: createdFlow.id,
        name: "Basic Flow",
      });
    });

    it("should create a flow with action steps", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flowData = {
        name: "Email Verification Flow",
        actions: [
          {
            id: "step-1",
            type: "EMAIL" as const,
            action: "VERIFY_EMAIL" as const,
            params: {
              email: "{{context.user.email}}",
            },
          },
        ],
      };

      const createdFlow = await data.flows.create("tenantId", flowData);

      expect(createdFlow).toMatchObject({
        name: "Email Verification Flow",
        actions: [
          {
            id: "step-1",
            type: "EMAIL",
            action: "VERIFY_EMAIL",
          },
        ],
      });
    });

    it("should create a flow with multiple action steps", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flowData = {
        name: "Multi-step Flow",
        actions: [
          {
            id: "step-1",
            type: "EMAIL" as const,
            action: "VERIFY_EMAIL" as const,
            params: {
              email: "{{context.user.email}}",
            },
          },
          {
            id: "step-2",
            type: "AUTH0" as const,
            action: "UPDATE_USER" as const,
            params: {
              user_id: "{{context.user.user_id}}",
              changes: {
                email: "{{context.form.email}}",
              },
            },
          },
        ],
      };

      const createdFlow = await data.flows.create("tenantId", flowData);

      expect(createdFlow.actions).toHaveLength(2);
    });
  });
});
