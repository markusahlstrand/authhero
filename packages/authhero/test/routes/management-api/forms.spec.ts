import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Form, FormFieldType, FormType } from "@authhero/adapter-interfaces";

describe("forms", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // --------------------------------------------
    // POST
    // --------------------------------------------
    const createFormResponse = await managementClient.forms.$post(
      {
        json: {
          name: "signup",
          type: FormType.SIGNUP,
          fields: [
            {
              type: FormFieldType.TEXT,
              name: "email",
              id: "email",
              label: "Email",
              required: true,
              readOnly: false,
              disabled: false,
              visible: true,
            },
          ],
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(createFormResponse.status).toBe(201);
    const createdForm = await createFormResponse.json();
    const { created_at, updated_at, id, ...rest } = createdForm;
    expect(rest).toMatchObject({
      name: "signup",
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(id).toBeTypeOf("string");

    // --------------------------------------------
    // PATCH
    // --------------------------------------------
    const updateFormResponse = await managementClient.forms[":id"].$patch(
      {
        param: {
          id: id!,
        },
        json: {
          name: "signup-updated",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(updateFormResponse.status).toBe(200);
    const updatedForm = (await updateFormResponse.json()) as Form;
    expect(updatedForm.name).toBe("signup-updated");

    // --------------------------------------------
    // GET
    // --------------------------------------------
    const getFormResponse = await managementClient.forms[":id"].$get(
      {
        param: {
          id: id!,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(getFormResponse.status).toBe(200);
    const fetchedForm = await getFormResponse.json();
    expect(fetchedForm.name).toBe("signup-updated");

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteFormResponse = await managementClient.forms[":id"].$delete(
      {
        param: {
          id: id!,
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(deleteFormResponse.status).toBe(200);

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listFormsResponse = await managementClient.forms.$get(
      {
        query: {},
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(listFormsResponse.status).toBe(200);
    const forms = await listFormsResponse.json();
    expect(forms).toEqual([]);
  });
});
