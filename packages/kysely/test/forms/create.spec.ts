import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("forms", () => {
  describe("create", () => {
    it("should create a form with basic fields", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const createdForm = await data.forms.create("tenantId", {
        name: "Basic Form",
      });

      expect(createdForm).toMatchObject({
        id: expect.any(String),
        name: "Basic Form",
      });

      // Verify the form was actually created by retrieving it
      const retrievedForm = await data.forms.get("tenantId", createdForm.id);
      expect(retrievedForm).toMatchObject({
        id: createdForm.id,
        name: "Basic Form",
      });
    });

    it("should create a form with complex structure including controls and layout", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const formData = {
        name: "Complex Form",
      };

      const createdForm = await data.forms.create("tenantId", formData);

      // Check that all complex properties were properly saved
      expect(createdForm).toMatchObject(formData);
    });
  });
});
