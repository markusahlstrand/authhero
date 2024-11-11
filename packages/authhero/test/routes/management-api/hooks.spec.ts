import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Hook } from "@authhero/adapter-interfaces";

describe("hooks", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // --------------------------------------------
    // POST
    // --------------------------------------------
    const createHooksResponse = await managementClient.api.v2.hooks.$post(
      {
        json: {
          url: "https://example.com/hook",
          trigger_id: "pre-user-signup",
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

    if (createHooksResponse.status !== 201) {
      const message = await createHooksResponse.text();
      console.log(message);
    }

    expect(createHooksResponse.status).toBe(201);
    const createdHook = await createHooksResponse.json();

    const { created_at, updated_at, hook_id, ...rest } = createdHook;

    expect(rest).toEqual({
      url: "https://example.com/hook",
      trigger_id: "pre-user-signup",
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(hook_id).toBeTypeOf("string");

    // --------------------------------------------
    // PATCH
    // --------------------------------------------
    const updateHookResponse = await managementClient.api.v2.hooks[
      ":id"
    ].$patch(
      {
        param: {
          id: hook_id!,
        },
        json: {
          url: "https://example.com/hook2",
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

    expect(updateHookResponse.status).toBe(200);
    const updatedHook = (await updateHookResponse.json()) as Hook;
    expect(updatedHook.url).toEqual("https://example.com/hook2");

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteHookResponse = await managementClient.api.v2.hooks[
      ":id"
    ].$delete(
      {
        param: {
          id: hook_id!,
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

    expect(deleteHookResponse.status).toBe(200);

    // --------------------------------------------
    // LIST
    // --------------------------------------------
    const listHooksResponse = await managementClient.api.v2.hooks.$get(
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

    expect(listHooksResponse.status).toBe(200);
    const hooks = await listHooksResponse.json();
    expect(hooks).toEqual([]);
  });
});