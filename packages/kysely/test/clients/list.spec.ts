import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("clients", () => {
  describe("list", () => {
    it("should list clients with totals", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      await data.clients.create("tenantId", {
        client_id: "client-1",
        name: "First Client",
      });

      await data.clients.create("tenantId", {
        client_id: "client-2",
        name: "Second Client",
      });

      const result = await data.clients.list("tenantId", {
        include_totals: true,
      });

      expect(result.clients).toHaveLength(2);
      expect(result.totals).toMatchObject({
        start: 0,
        limit: 10,
        length: 2,
        total: 2,
      });
    });

    it("should filter clients by name using q parameter", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      await data.clients.create("tenantId", {
        client_id: "client-1",
        name: "My Web App",
      });

      await data.clients.create("tenantId", {
        client_id: "client-2",
        name: "My Mobile App",
      });

      await data.clients.create("tenantId", {
        client_id: "client-3",
        name: "Backend Service",
      });

      const result = await data.clients.list("tenantId", {
        q: "My",
        include_totals: true,
      });

      expect(result.clients).toHaveLength(2);
      expect(result.totals?.total).toBe(2);
      expect(result.clients.map((c) => c.name).sort()).toEqual([
        "My Mobile App",
        "My Web App",
      ]);
    });

    it("should filter clients by client_id using q parameter", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      await data.clients.create("tenantId", {
        client_id: "web-app-123",
        name: "Web App",
      });

      await data.clients.create("tenantId", {
        client_id: "api-service-456",
        name: "API Service",
      });

      const result = await data.clients.list("tenantId", {
        q: "web-app",
        include_totals: true,
      });

      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].client_id).toBe("web-app-123");
    });

    it("should support page-based pagination", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      for (let i = 0; i < 5; i++) {
        await data.clients.create("tenantId", {
          client_id: `client-${i}`,
          name: `Client ${i}`,
        });
      }

      const page0 = await data.clients.list("tenantId", {
        page: 0,
        per_page: 2,
        include_totals: true,
      });

      expect(page0.clients).toHaveLength(2);
      expect(page0.totals).toMatchObject({
        start: 0,
        limit: 2,
        length: 2,
        total: 5,
      });

      const page1 = await data.clients.list("tenantId", {
        page: 1,
        per_page: 2,
        include_totals: true,
      });

      expect(page1.clients).toHaveLength(2);
      expect(page1.totals).toMatchObject({
        start: 2,
        limit: 2,
        length: 2,
        total: 5,
      });

      const page2 = await data.clients.list("tenantId", {
        page: 2,
        per_page: 2,
        include_totals: true,
      });

      expect(page2.clients).toHaveLength(1);
      expect(page2.totals).toMatchObject({
        start: 4,
        limit: 2,
        length: 1,
        total: 5,
      });
    });

    it("should support checkpoint pagination with from/take", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      for (let i = 0; i < 5; i++) {
        await data.clients.create("tenantId", {
          client_id: `client-${i}`,
          name: `Client ${i}`,
        });
      }

      const result = await data.clients.list("tenantId", {
        from: "2",
        take: 2,
        include_totals: true,
      });

      expect(result.clients).toHaveLength(2);
      expect(result.totals).toMatchObject({
        start: 2,
        limit: 2,
        length: 2,
        total: 5,
      });
    });

    it("should support sorting", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      await data.clients.create("tenantId", {
        client_id: "client-b",
        name: "Bravo",
      });

      await data.clients.create("tenantId", {
        client_id: "client-a",
        name: "Alpha",
      });

      await data.clients.create("tenantId", {
        client_id: "client-c",
        name: "Charlie",
      });

      const ascResult = await data.clients.list("tenantId", {
        sort: { sort_by: "name", sort_order: "asc" },
      });

      expect(ascResult.clients.map((c) => c.name)).toEqual([
        "Alpha",
        "Bravo",
        "Charlie",
      ]);

      const descResult = await data.clients.list("tenantId", {
        sort: { sort_by: "name", sort_order: "desc" },
      });

      expect(descResult.clients.map((c) => c.name)).toEqual([
        "Charlie",
        "Bravo",
        "Alpha",
      ]);
    });

    it("should combine search with pagination", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        friendly_name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      for (let i = 0; i < 5; i++) {
        await data.clients.create("tenantId", {
          client_id: `app-${i}`,
          name: `App ${i}`,
        });
      }

      await data.clients.create("tenantId", {
        client_id: "service-1",
        name: "Backend Service",
      });

      const result = await data.clients.list("tenantId", {
        q: "App",
        page: 0,
        per_page: 2,
        include_totals: true,
      });

      expect(result.clients).toHaveLength(2);
      expect(result.totals?.total).toBe(5);
    });
  });
});
