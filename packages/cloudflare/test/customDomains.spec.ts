import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { getTestServer } from "./helpers/test-server";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import createAdapters from "../src";
import { HTTPException } from "hono/http-exception";

const baseMock = {
  errors: [],
  messages: [],
  success: true,
  result: {
    id: "customHostnameId",
    hostname: "example.com",
    ssl: {
      id: "sslId",
      certificate_authority: "certificate_authority",
      method: "http",
      type: "dv",
      wildcard: true,
    },
    custom_metadata: {},
    ownership_verification: {
      name: "test.example.com",
      type: "TXT",
      value: "test.example.com",
    },
    ownership_verification_http: {
      http_body: "test.example.com",
      http_url: "test.example.com",
    },
    status: "pending",
    created_at: new Date().toISOString(),
  },
};

let mockDatabase = {};

const server = setupServer(
  http.post(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames",
    async ({ request }) => {
      const body = await request.json();

      const result = structuredClone(baseMock);
      // @ts-ignore
      result.result.hostname = body.hostname as string;

      return HttpResponse.json(result);
    },
  ),
  http.patch(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames/customHostnameId",
    async ({ request }) => {
      const result = structuredClone(baseMock);

      const body = await request.json();

      mockDatabase = {
        ...mockDatabase,
        //@ts-ignore
        ...body,
      };

      result.result = {
        ...result.result,
        ...mockDatabase,
      };

      return HttpResponse.json(result);
    },
  ),
  // Get
  http.get(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames/customHostnameId",
    async () => {
      const result = structuredClone(baseMock);

      result.result = {
        ...result.result,
        ...mockDatabase,
      };

      return HttpResponse.json(result);
    },
  ),
  // List
  http.get(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames",
    async () => {
      const result = structuredClone(baseMock);

      // @ts-ignore. This is changing the result to an array which make typescript unhappy
      result.result = [
        {
          ...result.result,
          ...mockDatabase,
        },
      ];

      return HttpResponse.json(result);
    },
  ),
  // Delete
  http.delete(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames/customHostnameId",
    async () => {
      return HttpResponse.text();
    },
  ),
);

describe("customDomains", () => {
  beforeAll(() => server.listen());
  afterEach(() => {
    mockDatabase = {};
    server.resetHandlers();
  });
  afterAll(() => server.close());

  it("should ", async () => {
    const { data } = await getTestServer();

    const { customDomains } = createAdapters({
      zoneId: "zoneId",
      authKey: "authKey",
      authEmail: "authEmail",
      enterprise: false,
      customDomainAdapter: data.customDomains,
    });

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

    const createdCustomDomain = await customDomains.create("tenantId", {
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

    const databaseCustomDomain = await data.customDomains.get(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(databaseCustomDomain).toMatchObject({
      domain: "example.com",
      type: "auth0_managed_certs",
      custom_domain_id: expect.any(String),
      status: "pending",
      primary: false,
    });

    // ----------------------------------------
    // Update
    // --------------------------------

    const updateCustomDomainResult = await customDomains.update(
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

    const getCustomDomainResult = await customDomains.get(
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

    const listCustomDomainsResult = await customDomains.list("tenantId");
    expect(listCustomDomainsResult.length).toBe(1);

    // Check that this entry isn't displayed for other tenants
    const listCustomDomainsForOtherTenantResult =
      await customDomains.list("tenantId2");
    expect(listCustomDomainsForOtherTenantResult.length).toBe(0);

    // ----------------------------------------
    // Delete
    // --------------------------------

    const deleteCustomDomainResult = await customDomains.remove(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );

    expect(deleteCustomDomainResult).toBe(true);

    // ----------------------------------------
    // Get with not found
    // --------------------------------

    try {
      await customDomains.get("tenantId", createdCustomDomain.custom_domain_id);
    } catch (err) {
      if (err instanceof HTTPException) {
        expect(err.status).toBe(404);
      } else {
        throw err;
      }
    }
  });
});
