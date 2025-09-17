import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("clients", () => {
  it("should support crud", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const createClientResponse = await managementClient.clients.$post(
      {
        json: {
          client_id: "app",
          name: "app",
          callbacks: [],
          allowed_logout_urls: [],
          allowed_origins: [],
          web_origins: [],
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

    expect(createClientResponse.status).toBe(201);
    const createdClient = await createClientResponse.json();

    const { created_at, updated_at, client_id, client_secret, ...rest } =
      createdClient;

    expect(rest).toEqual({
      cross_origin_authentication: false,
      custom_login_page_on: false,
      global: false,
      is_first_party: false,
      name: "app",
      oidc_conformant: true,
      require_proof_of_possession: false,
      require_pushed_authorization_requests: false,
      sso: false,
      sso_disabled: true,
      callbacks: [],
      allowed_logout_urls: [],
      allowed_origins: [],
      web_origins: [],
    });
    expect(created_at).toBeTypeOf("string");
    expect(updated_at).toBeTypeOf("string");
    expect(client_secret).toBeTypeOf("string");
    expect(client_id).toBeTypeOf("string");

    // --------------------------------------------
    // PATCH
    // --------------------------------------------
    const patchResult = await managementClient.clients[":id"].$patch(
      {
        param: {
          id: client_id,
        },
        json: {
          name: "new name",
          client_metadata: {
            email_validation: "disabled",
          },
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

    expect(patchResult.status).toBe(200);
    const patchedClient = await patchResult.json();
    expect(patchedClient.name).toBe("new name");
    expect(patchedClient.client_metadata?.email_validation).toBe("disabled");

    // --------------------------------------------
    // GET
    // --------------------------------------------
    const getResponse = await managementClient.clients[":id"].$get(
      {
        param: {
          id: client_id,
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

    expect(getResponse.status).toBe(200);

    // --------------------------------------------
    // DELETE
    // --------------------------------------------
    const deleteResponse = await managementClient.clients[":id"].$delete(
      {
        param: {
          id: client_id,
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
    expect(deleteResponse.status).toBe(200);

    // --------------------------------------------
    // GET 404
    // --------------------------------------------
    const get404Response = await managementClient.clients[":id"].$get(
      {
        param: {
          id: client_id,
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

    expect(get404Response.status).toBe(404);
  });
});
