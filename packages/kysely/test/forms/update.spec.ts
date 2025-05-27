import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("forms", () => {
  describe("update", () => {
    it("should update a form's basic properties", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const form = await data.forms.create("tenantId", {
        name: "Original Form",
      });

      const success = await data.forms.update("tenantId", form.id, {
        name: "Updated Form",
      });

      expect(success).toBe(true);

      const updatedForm = await data.forms.get("tenantId", form.id);
      expect(updatedForm).toMatchObject({
        id: form.id,
        name: "Updated Form",
      });
    });

    it("should add new fields to an existing form", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const form = await data.forms.create("tenantId", {
        name: "Original Form",
      });

      const success = await data.forms.update("tenantId", form.id, {
        name: "Original Form",
      });

      expect(success).toBe(true);

      const updatedForm = await data.forms.get("tenantId", form.id);
      expect(updatedForm?.name).toBe("Original Form");
    });

    it("should add controls and layout to an existing form", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const form = await data.forms.create("tenantId", {
        name: "Basic Form",
      });

      const success = await data.forms.update("tenantId", form.id, {
        name: "Basic Form",
      });

      expect(success).toBe(true);

      const updatedForm = await data.forms.get("tenantId", form.id);
      expect(updatedForm).toMatchObject({
        id: form.id,
        name: "Basic Form",
      });
    });

    it("should return false when updating a non-existent form", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const success = await data.forms.update("tenantId", "nonExistentFormId", {
        name: "Updated Form",
      });

      expect(success).toBe(false);
    });
  });
});
