import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("forms", () => {
  describe("get", () => {
    it("should retrieve a specific form by ID", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const { id } = await data.forms.create("tenantId", {
        name: "Basic Form",
      });

      const form = await data.forms.get("tenantId", id);

      expect(form).toMatchObject({
        id,
        name: "Basic Form",
      });
    });

    it("should return null when form does not exist", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const form = await data.forms.get("tenantId", "nonExistentForm");
      expect(form).toBeNull();
    });
  });
});
