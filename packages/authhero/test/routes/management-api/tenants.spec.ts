import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { Tenant } from "@authhero/adapter-interfaces";

describe("tenants", () => {
  it("should add a new tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const fixtureTenantsResponse = await managementClient.api.v2.tenants.$get(
      {
        query: {},
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(fixtureTenantsResponse.status).toBe(200);
    const tenantFixtures: Tenant[] =
      (await fixtureTenantsResponse.json()) as Tenant[];
    // check we have only initially seeded tenants
    expect(tenantFixtures.length).toEqual(1);

    // now create a tenant
    const createTenantResponse = await managementClient.api.v2.tenants.$post(
      {
        json: {
          name: "test",
          audience: "test",
          sender_name: "test",
          sender_email: "test@example.com",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createTenantResponse.status).toBe(201);
    const createdTenant = (await createTenantResponse.json()) as Tenant;

    expect(createdTenant.name).toBe("test");

    // now fetch list of tenants again to assert tenant deleted
    const listTenantsResponse = await managementClient.api.v2.tenants.$get(
      {
        query: {},
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(listTenantsResponse.status).toBe(200);
    const tenantsList = (await listTenantsResponse.json()) as Tenant[];
    expect(tenantsList.length).toEqual(2);
    expect(tenantsList[1]?.id).toEqual(createdTenant.id);
  });

  it("should remove a tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const fixtureTenantsResponse = await managementClient.api.v2.tenants.$get(
      { query: {} },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(fixtureTenantsResponse.status).toBe(200);
    const fixtureTenants = (await fixtureTenantsResponse.json()) as Tenant[];
    expect(fixtureTenants.length).toEqual(1);

    const deleteTenantResponse = await managementClient.api.v2.tenants[
      ":id"
    ].$delete(
      {
        param: {
          id: "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(deleteTenantResponse.status).toBe(200);

    // fetch list of tenants again - assert we are one down
    const listTenantsResponse = await managementClient.api.v2.tenants.$get(
      { query: {} },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(listTenantsResponse.status).toBe(200);
    const tenantsList = (await listTenantsResponse.json()) as Tenant[];
    expect(tenantsList.length).toEqual(0);
  });
});
