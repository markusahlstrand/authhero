import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("forms", () => {
  describe("list", () => {
    it("should list a form with fields as a JSON object", async () => {
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

      const result = await data.forms.list("tenantId");

      expect(result).toMatchObject({
        forms: [
          expect.objectContaining({
            id: form.id,
            name: "Basic Form",
          }),
        ],
        length: 1,
        limit: 50,
      });
    });

    it("should list multiple forms", async () => {
      const { data } = await getTestServer();

      await data.tenants.create({
        id: "tenantId",
        name: "Test Tenant",
        audience: "https://example.com",
        sender_email: "login@example.com",
        sender_name: "SenderName",
      });

      const form1 = await data.forms.create("tenantId", {
        name: "Registration Form",
      });

      const form2 = await data.forms.create("tenantId", {
        name: "Contact Form",
      });

      const result = await data.forms.list("tenantId");

      expect(result.forms).toHaveLength(2);
      expect(result.length).toBe(2);
      expect(result.forms.map((form) => form.id)).toContain(form1.id);
      expect(result.forms.map((form) => form.id)).toContain(form2.id);
    });
  });
});
