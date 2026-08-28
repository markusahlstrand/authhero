import { describe, expect, it, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { getTestServer } from "./helpers/test-server";
import { syncCustomDomains } from "../src";
import type { CloudflareConfig } from "../src";

const LIST_URL =
  "https://api.cloudflare.com/client/v4/zones/zoneId/custom_hostnames";

function hostnameResult(
  overrides: {
    id?: string;
    hostname?: string;
    status?: string;
    tenant_id?: string;
  } = {},
) {
  return {
    id: overrides.id ?? "cfHostnameId",
    hostname: overrides.hostname ?? "login.example.com",
    ssl: {
      id: "sslId",
      certificate_authority: "google",
      method: "txt",
      type: "dv",
      wildcard: false,
    },
    custom_metadata: overrides.tenant_id
      ? { tenant_id: overrides.tenant_id }
      : {},
    status: overrides.status ?? "active",
    created_at: new Date().toISOString(),
  };
}

/** Serve `pages[n]` for `?page=n+1`, and an empty page beyond the end. */
function listPages(pages: ReturnType<typeof hostnameResult>[][]) {
  return http.get(LIST_URL, ({ request }) => {
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    return HttpResponse.json({
      errors: [],
      messages: [],
      success: true,
      result: pages[page - 1] ?? [],
    });
  });
}

const server = setupServer();

async function setup(enterprise = false) {
  const { data } = await getTestServer();
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  const config: CloudflareConfig = {
    zoneId: "zoneId",
    authKey: "authKey",
    authEmail: "authEmail",
    enterprise,
    customDomainAdapter: data.customDomains,
  };

  return { data, config };
}

describe("syncCustomDomains", () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it("promotes a pending row once Cloudflare reports the hostname active", async () => {
    const { data, config } = await setup();
    await data.customDomains.create("tenantId", {
      custom_domain_id: "cfHostnameId",
      domain: "login.example.com",
      type: "auth0_managed_certs",
    });
    server.use(listPages([[hostnameResult({ status: "active" })]]));

    const result = await syncCustomDomains(config);

    expect(result).toMatchObject({
      scanned: 1,
      matched: 1,
      updated: 1,
      unknown: 0,
      mismatched: 0,
      errors: 0,
    });
    const stored = await data.customDomains.get("tenantId", "cfHostnameId");
    expect(stored?.status).toBe("ready");
  });

  it("is idempotent — a second sweep over unchanged state writes nothing", async () => {
    const { data, config } = await setup();
    await data.customDomains.create("tenantId", {
      custom_domain_id: "cfHostnameId",
      domain: "login.example.com",
      type: "auth0_managed_certs",
    });
    server.use(listPages([[hostnameResult({ status: "active" })]]));

    await syncCustomDomains(config);
    const second = await syncCustomDomains(config);

    expect(second).toMatchObject({ scanned: 1, matched: 1, updated: 0 });
  });

  it("reverts a row when the hostname stops being active at the edge", async () => {
    const { data, config } = await setup();
    await data.customDomains.create("tenantId", {
      custom_domain_id: "cfHostnameId",
      domain: "login.example.com",
      type: "auth0_managed_certs",
    });
    await data.customDomains.update("tenantId", "cfHostnameId", {
      status: "ready",
    });
    server.use(listPages([[hostnameResult({ status: "moved" })]]));

    const result = await syncCustomDomains(config);

    expect(result.updated).toBe(1);
    const stored = await data.customDomains.get("tenantId", "cfHostnameId");
    expect(stored?.status).toBe("pending");
  });

  it("counts a hostname with no stored row as unknown and leaves it alone", async () => {
    const { config } = await setup();
    server.use(
      listPages([[hostnameResult({ hostname: "stray.example.com" })]]),
    );

    const result = await syncCustomDomains(config);

    expect(result).toMatchObject({ scanned: 1, matched: 0, unknown: 1 });
  });

  it("skips a row whose id no longer matches the hostname at the edge", async () => {
    const { data, config } = await setup();
    await data.customDomains.create("tenantId", {
      custom_domain_id: "staleId",
      domain: "login.example.com",
      type: "auth0_managed_certs",
    });
    server.use(listPages([[hostnameResult({ id: "recreatedId" })]]));

    const result = await syncCustomDomains(config);

    expect(result).toMatchObject({ scanned: 1, matched: 0, mismatched: 1 });
    const stored = await data.customDomains.get("tenantId", "staleId");
    expect(stored?.status).toBe("pending");
  });

  it("refuses to mirror across a tenant boundary on an enterprise zone", async () => {
    const { data, config } = await setup(true);
    await data.customDomains.create("tenantId", {
      custom_domain_id: "cfHostnameId",
      domain: "login.example.com",
      type: "auth0_managed_certs",
    });
    server.use(listPages([[hostnameResult({ tenant_id: "otherTenant" })]]));

    const result = await syncCustomDomains(config);

    expect(result).toMatchObject({ matched: 0, mismatched: 1, updated: 0 });
    const stored = await data.customDomains.get("tenantId", "cfHostnameId");
    expect(stored?.status).toBe("pending");
  });

  it("walks every page until Cloudflare returns a short one", async () => {
    const { data, config } = await setup();
    for (let i = 0; i < 3; i++) {
      await data.customDomains.create("tenantId", {
        custom_domain_id: `id-${i}`,
        domain: `d${i}.example.com`,
        type: "auth0_managed_certs",
      });
    }
    server.use(
      listPages([
        [
          hostnameResult({ id: "id-0", hostname: "d0.example.com" }),
          hostnameResult({ id: "id-1", hostname: "d1.example.com" }),
        ],
        [hostnameResult({ id: "id-2", hostname: "d2.example.com" })],
      ]),
    );

    const result = await syncCustomDomains(config, { perPage: 2 });

    expect(result).toMatchObject({ scanned: 3, matched: 3, updated: 3 });
  });

  it("returns the partial result instead of throwing when a page fails", async () => {
    const { data, config } = await setup();
    await data.customDomains.create("tenantId", {
      custom_domain_id: "id-0",
      domain: "d0.example.com",
      type: "auth0_managed_certs",
    });
    server.use(
      http.get(LIST_URL, ({ request }) => {
        const page = Number(
          new URL(request.url).searchParams.get("page") ?? "1",
        );
        if (page === 1) {
          return HttpResponse.json({
            errors: [],
            messages: [],
            success: true,
            result: [
              hostnameResult({ id: "id-0", hostname: "d0.example.com" }),
            ],
          });
        }
        return HttpResponse.json({
          errors: [{ code: 1000, message: "boom" }],
          messages: [],
          success: false,
          result: [],
        });
      }),
    );

    const result = await syncCustomDomains(config, { perPage: 1 });

    expect(result).toMatchObject({ scanned: 1, updated: 1, errors: 1 });
    const stored = await data.customDomains.get("tenantId", "id-0");
    expect(stored?.status).toBe("ready");
  });
});
