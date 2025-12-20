import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("flows", () => {
  describe("list", () => {
    it("should list flows for a tenant", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow = await data.flows.create("tenantId", {
        name: "Test Flow",
      });

      const result = await data.flows.list("tenantId", {
        include_totals: true,
      });

      expect(result).toMatchObject({
        flows: [
          expect.objectContaining({
            id: flow.id,
            name: "Test Flow",
          }),
        ],
        length: 1,
        limit: 50,
      });
    });

    it("should list multiple flows", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const flow1 = await data.flows.create("tenantId", {
        name: "Email Flow",
      });

      const flow2 = await data.flows.create("tenantId", {
        name: "User Update Flow",
      });

      const result = await data.flows.list("tenantId", {
        include_totals: true,
      });

      expect(result.flows).toHaveLength(2);
      expect(result.length).toBe(2);
      expect(result.flows.map((f) => f.id)).toContain(flow1.id);
      expect(result.flows.map((f) => f.id)).toContain(flow2.id);
    });

    it("should return empty list when no flows exist", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const result = await data.flows.list("tenantId", {
        include_totals: true,
      });

      expect(result.flows).toHaveLength(0);
      expect(result.length).toBe(0);
    });

    it("should paginate results correctly", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      // Create 5 flows
      for (let i = 1; i <= 5; i++) {
        await data.flows.create("tenantId", {
          name: `Flow ${i}`,
        });
      }

      // Get first page with 2 items
      const page1 = await data.flows.list("tenantId", {
        page: 0,
        per_page: 2,
        include_totals: true,
      });

      expect(page1.flows).toHaveLength(2);
      expect(page1.length).toBe(5);
      expect(page1.start).toBe(0);
      expect(page1.limit).toBe(2);

      // Get second page
      const page2 = await data.flows.list("tenantId", {
        page: 1,
        per_page: 2,
        include_totals: true,
      });

      expect(page2.flows).toHaveLength(2);
      expect(page2.start).toBe(2);
    });

    it("should not list flows from different tenants", async () => {
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

      await data.flows.create("tenant1", {
        name: "Tenant 1 Flow",
      });

      const result = await data.flows.list("tenant2", {
        include_totals: true,
      });

      expect(result.flows).toHaveLength(0);
      expect(result.length).toBe(0);
    });
  });
});
