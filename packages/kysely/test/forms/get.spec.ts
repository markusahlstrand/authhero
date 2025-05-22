import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { FormType } from "@authhero/adapter-interfaces";
import { FormFieldType } from "@authhero/adapter-interfaces";

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

      const form = await data.forms.get("tenantId", id);

      expect(form).toMatchObject({
        id,
        name: "Basic Form",
        fields: [
          {
            id: "field1",
            type: "text",
            label: "Name",
            required: true,
          },
        ],
        controls: [],
        layout: {
          columns: 1,
        },
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
