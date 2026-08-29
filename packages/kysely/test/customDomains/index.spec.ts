import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("customDomains", () => {
  it("should should support crud operations", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Create
    // --------------------------------

    const createdCustomDomain = await data.customDomains.create("tenantId", {
      domain: "example.com",
      type: "auth0_managed_certs",
    });

    expect(createdCustomDomain).toMatchObject({
      domain: "example.com",
      type: "auth0_managed_certs",
      custom_domain_id: expect.any(String),
      status: "pending",
      primary: false,
    });

    // ----------------------------------------
    // Update
    // --------------------------------

    const updateCustomDomainResult = await data.customDomains.update(
      "tenantId",
      createdCustomDomain.custom_domain_id,
      {
        primary: true,
      },
    );

    expect(updateCustomDomainResult).toBe(true);

    // ----------------------------------------
    // Get
    // --------------------------------¨¨

    const getCustomDomainResult = await data.customDomains.get(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(getCustomDomainResult).toMatchObject({
      domain: "example.com",
      type: "auth0_managed_certs",
      primary: true,
      custom_domain_id: createdCustomDomain.custom_domain_id,
    });

    // ----------------------------------------
    // List
    // --------------------------------

    const listCustomDomainsResult = await data.customDomains.list("tenantId");
    expect(listCustomDomainsResult.length).toBe(1);

    // ----------------------------------------
    // Delete
    // --------------------------------

    const deleteCustomDomainResult = await data.customDomains.remove(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(deleteCustomDomainResult).toBe(true);

    // ----------------------------------------
    // Get with not found
    // --------------------------------
    const getCustomDomainResultNotFound = await data.customDomains.get(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(getCustomDomainResultNotFound).toBe(null);
  });

  // `getByDomain` used to skip the JSON parse that `get` does, so the routing
  // path saw `verification` as a raw string while the by-id path saw an object.
  it("returns verification in the same shape from get and getByDomain", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const created = await data.customDomains.create("tenantId", {
      domain: "login.example.com",
      type: "auth0_managed_certs",
    });

    const verification = {
      methods: [
        {
          name: "txt" as const,
          record: "record-value",
          domain: "_acme.login.example.com",
        },
      ],
    };
    await data.customDomains.update("tenantId", created.custom_domain_id, {
      status: "ready",
      verification,
    });

    const byId = await data.customDomains.get(
      "tenantId",
      created.custom_domain_id,
    );
    const byDomain = await data.customDomains.getByDomain("login.example.com");

    expect(byId?.verification).toEqual(verification);
    expect(byDomain?.verification).toEqual(verification);
  });
});
