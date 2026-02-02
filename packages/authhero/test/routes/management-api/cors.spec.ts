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
  });

  it("should not set CORS headers for unknown origin", async () => {
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

    expect(initialResponse.headers.get("Access-Control-Allow-Origin")).toBeNull();

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
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });
});
