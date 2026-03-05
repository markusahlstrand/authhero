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
let lastCreatePayload: Record<string, unknown> = {};
let lastUpdatePayload: Record<string, unknown> = {};

const server = setupServer(
  http.post(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames",
    async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;

      const result = structuredClone(baseMock);
      result.result.hostname = body.hostname as string;

      // Capture the ssl.certificate_authority if provided
      if (
        body.ssl &&
        typeof body.ssl === "object" &&
        "certificate_authority" in body.ssl
      ) {
        result.result.ssl.certificate_authority = (
          body.ssl as Record<string, string>
        ).certificate_authority;
      }

      lastCreatePayload = body;

      return HttpResponse.json(result);
    },
  ),
  http.patch(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames/customHostnameId",
    async ({ request }) => {
      const result = structuredClone(baseMock);

      const body = (await request.json()) as Record<string, unknown>;

      // Deep merge ssl so we don't lose fields like wildcard
      if (body.ssl && typeof body.ssl === "object") {
        mockDatabase = {
          ...mockDatabase,
          ssl: {
            ...result.result.ssl,
            ...(mockDatabase as Record<string, unknown>).ssl as
            | Record<string, unknown>
            | undefined,
            ...(body.ssl as Record<string, unknown>),
          },
        };
      } else {
        mockDatabase = {
          ...mockDatabase,
          ...body,
        };
      }

      result.result = {
        ...result.result,
        ...mockDatabase,
      };

      lastUpdatePayload = body;

      return HttpResponse.json(result);
    },
  ),
  // Get
  http.get(
    "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames/customHostnameId",
    async () => {
      const result = structuredClone(baseMock);

      // Deep merge ssl so we don't lose required fields
      const { ssl: mockSsl, ...restMock } = mockDatabase as Record<
        string,
        unknown
      >;
      result.result = {
        ...result.result,
        ...restMock,
        ...(mockSsl
          ? {
            ssl: {
              ...result.result.ssl,
              ...(mockSsl as Record<string, unknown>),
            },
          }
          : {}),
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
    lastCreatePayload = {};
    lastUpdatePayload = {};
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

  it("should pass ssl properties to Cloudflare when set in domain_metadata", async () => {
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
    // Create with ssl.certificate_authority in domain_metadata
    // ----------------------------------------

    const createdCustomDomain = await customDomains.create("tenantId", {
      domain: "example.com",
      type: "auth0_managed_certs",
      domain_metadata: {
        "ssl.certificate_authority": "google",
      },
    });

    expect(createdCustomDomain).toMatchObject({
      domain: "example.com",
      type: "auth0_managed_certs",
      custom_domain_id: expect.any(String),
      status: "pending",
    });

    // Verify the Cloudflare API was called with certificate_authority in ssl
    expect(lastCreatePayload).toMatchObject({
      hostname: "example.com",
      ssl: {
        method: "txt",
        type: "dv",
        certificate_authority: "google",
      },
    });

    // Verify domain_metadata was persisted to the database
    const databaseCustomDomain = await data.customDomains.get(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );
    expect(databaseCustomDomain?.domain_metadata).toEqual({
      "ssl.certificate_authority": "google",
    });

    // Verify the response includes ssl.* keys in domain_metadata
    // (ssl.method reflects the Cloudflare response, which may differ from input)
    expect(createdCustomDomain.domain_metadata).toMatchObject({
      "ssl.certificate_authority": "google",
      "ssl.type": "dv",
    });

    // ----------------------------------------
    // Update ssl.certificate_authority via domain_metadata
    // The update should fetch current state and merge
    // ----------------------------------------

    await customDomains.update(
      "tenantId",
      createdCustomDomain.custom_domain_id,
      {
        domain_metadata: {
          "ssl.certificate_authority": "lets_encrypt",
        },
      },
    );

    // Verify the Cloudflare API was called with a merged ssl object
    // containing the current method/type plus the new certificate_authority
    expect(lastUpdatePayload).toMatchObject({
      ssl: {
        method: expect.any(String),
        type: "dv",
        certificate_authority: "lets_encrypt",
      },
    });

    // Verify domain_metadata was updated in the database
    const updatedDatabaseCustomDomain = await data.customDomains.get(
      "tenantId",
      createdCustomDomain.custom_domain_id,
    );
    expect(updatedDatabaseCustomDomain?.domain_metadata).toEqual({
      "ssl.certificate_authority": "lets_encrypt",
    });

    // ----------------------------------------
    // Update ssl.method via domain_metadata
    // ----------------------------------------

    lastUpdatePayload = {};
    await customDomains.update(
      "tenantId",
      createdCustomDomain.custom_domain_id,
      {
        domain_metadata: {
          "ssl.method": "http",
        },
      },
    );

    // Verify the merged ssl object contains the new method
    // plus the existing certificate_authority and type
    expect(lastUpdatePayload).toMatchObject({
      ssl: {
        method: "http",
        type: "dv",
        certificate_authority: expect.any(String),
      },
    });
  });
});
