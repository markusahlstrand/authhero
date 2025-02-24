import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";
import create from "../../../drizzle/src";

describe("customDomains", () => {
  it("should should support crud operations", async () => {
    const db = await getTestServer();

    await db.tenants.create({
      id: "tenantId",
      name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Create
    // --------------------------------

    const createdCustomDomain = await db.customDomains.create("tenantId", {
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

    const updateCustomDomainResult = await db.customDomains.update(
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

    const getCustomDomainResult = await db.customDomains.get(
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

    const listCustomDomainsResult = await db.customDomains.list("tenantId");
    expect(listCustomDomainsResult.length).toBe(1);

    // ----------------------------------------
    // Delete
    // --------------------------------

    const deleteCustomDomainResult = await db.customDomains.remove(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(deleteCustomDomainResult).toBe(true);

    // ----------------------------------------
    // Get with not found
    // --------------------------------
    const getCustomDomainResultNotFound = await db.customDomains.get(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(getCustomDomainResultNotFound).toBe(null);
  });
});
