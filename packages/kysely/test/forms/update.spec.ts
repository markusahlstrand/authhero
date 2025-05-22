import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import { FormFieldType } from "@authhero/adapter-interfaces";
import { FormType } from "@authhero/adapter-interfaces";

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
        type: FormType.CUSTOM,
        name: "Original Form",
        fields: [
          {
            id: "field1",
            name: "field1",
            type: FormFieldType.TEXT,
            label: "Original Label",
            required: true,
          },
        ],
      });

      const success = await data.forms.update("tenantId", form.id, {
        name: "Updated Form",
        fields: [
          {
            id: "field1",
            name: "field1",
            type: FormFieldType.TEXT,
            label: "Updated Label",
            required: false,
          },
        ],
      });

      expect(success).toBe(true);

      const updatedForm = await data.forms.get("tenantId", form.id);
      expect(updatedForm).toMatchObject({
        id: form.id,
        name: "Updated Form",
        fields: [
          {
            id: "field1",
            type: "text",
            label: "Updated Label",
            required: false,
          },
        ],
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
        type: FormType.CUSTOM,
        name: "Original Form",
        fields: [
          {
            id: "field1",
            name: "field1",
            type: FormFieldType.TEXT,
            label: "Name",
            required: true,
          },
        ],
      });

      const success = await data.forms.update("tenantId", form.id, {
        fields: [
          {
            id: "field1",
            name: "field1",
            type: FormFieldType.TEXT,
            label: "Name",
            required: true,
          },
          {
            id: "field2",
            name: "field2",
            type: FormFieldType.EMAIL,
            label: "Email",
            required: true,
          },
        ],
      });

      expect(success).toBe(true);

      const updatedForm = await data.forms.get("tenantId", form.id);
      expect(updatedForm?.fields).toHaveLength(2);
      expect(updatedForm?.fields[1]?.id).toBe("field2");
      expect(updatedForm?.fields[1]?.label).toBe("Email");
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
        type: FormType.CUSTOM,
        name: "Basic Form",
        fields: [
          {
            id: "field1",
            name: "field1",
            type: FormFieldType.TEXT,
            label: "Name",
            required: true,
          },
        ],
      });

      const success = await data.forms.update("tenantId", form.id, {
        controls: [
          {
            id: "controlsId",
            label: "Form Controls",
            type: "submit",
          },
        ],
        layout: {
          columns: 2,
        },
      });

      expect(success).toBe(true);

      const updatedForm = await data.forms.get("tenantId", form.id);
      expect(updatedForm).toMatchObject({
        id: form.id,
        name: "Basic Form",
        fields: [
          {
            id: "field1",
            type: "text",
            label: "Name",
            required: true,
          },
        ],
        controls: [
          {
            disabled: false,
            id: "controlsId",
            label: "Form Controls",
            type: "submit",
            visible: true,
          },
        ],
        layout: {
          columns: 2,
        },
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
