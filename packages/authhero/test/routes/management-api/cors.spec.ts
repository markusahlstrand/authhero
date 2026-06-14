import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

describe("management-api CORS", () => {
  it("should allow origin from client web_origins", async () => {
    const { managementApp, env } = await getTestServer();

    // The test client has web_origins: ["https://example.com"]
    const response = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "tenant-id": "tenantId",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("should resolve the tenant from a custom-domain host on preflight (no tenant-id header)", async () => {
    const { managementApp, env } = await getTestServer();

    // The admin console addresses tenant resources by host instead of the
    // `tenant-id` header. Browsers never send custom headers on a preflight,
    // so the tenant must be resolved from the host alone.
    await env.data.customDomains.create("tenantId", {
      custom_domain_id: "admin-domain-id",
      domain: "admin.tenant.example.com",
      type: "auth0_managed_certs",
    });

    const response = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "x-forwarded-host": "admin.tenant.example.com",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("should resolve the tenant from a subdomain host on preflight", async () => {
    const { managementApp, env } = await getTestServer();

    // ISSUER is http://localhost:3000/, so `{tenant}.localhost:3000` is the
    // tenant-subdomain host. Host labels are lowercased (RFC 3986), so the
    // subdomain path requires a lowercase tenant id — provision one.
    await env.data.tenants.create({
      id: "lowercasetenant",
      friendly_name: "Lowercase Tenant",
      audience: "https://lc.example.com",
      sender_email: "login@lc.example.com",
      sender_name: "LC",
    });
    await env.data.clients.create("lowercasetenant", {
      client_id: "lc-client",
      name: "LC Client",
      web_origins: ["https://lc.example.com"],
    });

    const response = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://lc.example.com",
          "x-forwarded-host": "lowercasetenant.localhost:3000",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://lc.example.com",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("should not set CORS headers for unknown origin but still set Vary", async () => {
    const { managementApp, env } = await getTestServer();

    const response = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://malicious.com",
          "tenant-id": "tenantId",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    // Vary: Origin must still be set so caches don't serve this denial to allowed origins
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("should allow origin after adding it to client web_origins", async () => {
    const { managementApp, env } = await getTestServer();

    // First, verify the origin is not allowed
    const initialResponse = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://newapp.example.com",
          "tenant-id": "tenantId",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    expect(
      initialResponse.headers.get("Access-Control-Allow-Origin"),
    ).toBeNull();

    // Update the client to add the new origin
    await env.data.clients.update("tenantId", "clientId", {
      web_origins: ["https://example.com", "https://newapp.example.com"],
    });

    // Now the origin should be allowed
    const updatedResponse = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://newapp.example.com",
          "tenant-id": "tenantId",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    expect(updatedResponse.status).toBe(204);
    expect(updatedResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://newapp.example.com",
    );
  });

  it("should set CORS headers on actual requests", async () => {
    const { managementApp, env } = await getTestServer();

    // Make an actual GET request (without auth, will fail but CORS headers should be set)
    const response = await managementApp.request(
      "/clients",
      {
        method: "GET",
        headers: {
          Origin: "https://example.com",
          "tenant-id": "tenantId",
        },
      },
      env,
    );

    // Even though the request fails (401), CORS headers should be set
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("should allow multiple origins from different clients simultaneously", async () => {
    const { managementApp, env } = await getTestServer();

    // Add a second origin to the client
    await env.data.clients.update("tenantId", "clientId", {
      web_origins: ["https://example.com", "https://other-app.example.com"],
    });

    // Request from first origin
    const response1 = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "tenant-id": "tenantId",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    // Request from second origin
    const response2 = await managementApp.request(
      "/clients",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://other-app.example.com",
          "tenant-id": "tenantId",
          "Access-Control-Request-Method": "GET",
        },
      },
      env,
    );

    // Both should be allowed with their respective origins
    expect(response1.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://example.com",
    );
    expect(response2.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://other-app.example.com",
    );
    // Both must have Vary: Origin for proper cache behavior
    expect(response1.headers.get("Vary")).toContain("Origin");
    expect(response2.headers.get("Vary")).toContain("Origin");
  });
});
