import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { FormType } from "@authhero/adapter-interfaces";
import { FormFieldType } from "@authhero/adapter-interfaces";

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
        type: FormType.CUSTOM,
        fields: [
          {
            id: "field1",
            type: FormFieldType.TEXT,
            label: "Name",
            required: true,
            name: "field1",
          },
        ],
      });

      const result = await data.forms.list("tenantId");

      expect(result).toMatchObject({
        forms: [
          {
            id: form.id,
            name: "Basic Form",
            fields: [
              {
                disabled: false,
                id: "field1",
                type: "text",
                label: "Name",
                required: true,
                name: "field1",
                readOnly: false,
                visible: true,
              },
            ],
          },
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
        type: FormType.CUSTOM,
        fields: [
          {
            id: "field1",
            name: "name",
            type: FormFieldType.TEXT,
            label: "Name",
            required: true,
          },
        ],
      });

      const form2 = await data.forms.create("tenantId", {
        type: FormType.CUSTOM,
        name: "Contact Form",
        fields: [
          {
            id: "field1",
            name: "name",
            type: FormFieldType.TEXT,
            label: "Message",
            required: true,
          },
        ],
      });

      const result = await data.forms.list("tenantId");

      expect(result.forms).toHaveLength(2);
      expect(result.length).toBe(2);
      expect(result.forms.map((form) => form.id)).toContain(form1.id);
      expect(result.forms.map((form) => form.id)).toContain(form2.id);
    });
  });
});
