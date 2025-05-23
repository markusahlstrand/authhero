import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import {
  FormFieldType,
  FormInsert,
  FormType,
} from "@authhero/adapter-interfaces";

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

      expect(createdForm).toMatchObject({
        id: expect.any(String),
        name: "Basic Form",
        fields: [
          {
            id: "field1",
            type: FormFieldType.TEXT,
            label: "Name",
            required: true,
          },
        ],
      });

      // Verify the form was actually created by retrieving it
      const retrievedForm = await data.forms.get("tenantId", createdForm.id);
      expect(retrievedForm).toMatchObject({
        id: createdForm.id,
        name: "Basic Form",
        fields: [
          {
            id: "field1",
            type: "text",
            label: "Name",
            required: true,
          },
        ],
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

      const formData: FormInsert = {
        name: "Complex Form",
        type: FormType.CUSTOM,
        fields: [
          {
            id: "field1",
            type: FormFieldType.TEXT,
            label: "Full Name",
            placeholder: "Enter your full name",
            required: true,
            name: "field1",
          },
          {
            id: "field2",
            type: FormFieldType.EMAIL,
            label: "Email Address",
            placeholder: "your.email@example.com",
            required: true,
            name: "field2",
            // validations: {
            // pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
            // },
          },
          {
            id: "field3",
            type: FormFieldType.SELECT,
            label: "Country",
            options: [
              { value: "us", label: "United States" },
              { value: "ca", label: "Canada" },
              { value: "uk", label: "United Kingdom" },
            ],
            required: false,
            name: "field3",
          },
        ],
        controls: [
          {
            id: "controlsId",
            label: "Form Controls",
            type: "submit",
          },
        ],
        layout: {
          columns: 1,
        },
      };

      const createdForm = await data.forms.create("tenantId", formData);

      // Check that all complex properties were properly saved
      expect(createdForm).toMatchObject(formData);
    });
  });
});
