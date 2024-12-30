import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("connections", () => {
  describe("list", () => {
    it("should list a connection with options as an object", async () => {
      const db = await getTestServer();

      await db.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      await db.connections.create("tenantId", {
        id: "connectionId",
        name: "mock-strategy",
        strategy: "mock-strategy",
        options: {
          client_id: "clientId",
          client_secret: "clientSecret",
        },
      });

      const connections = await db.connections.list("tenantId", {
        include_totals: true,
        page: 0,
        per_page: 10,
      });

      expect(connections).toMatchObject({
        connections: [
          {
            id: "connectionId",
            name: "mock-strategy",
            strategy: "mock-strategy",
            options: {
              client_id: "clientId",
              client_secret: "clientSecret",
            },
          },
        ],
        length: 1,
        limit: 10,
      });
    });
  });
});
