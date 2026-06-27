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

  // Regression (production CORS outage on the control plane): the Cloudflare
  // Workers runtime defines a `webSocket` property — value `null` — on *every*
  // Response. The actual-request CORS block used `"webSocket" in ctx.res` to
  // detect an upgrade, which is therefore always true in production, so the
  // whole block (Vary + Access-Control-*) was skipped on every real response.
  // Node's Response has no such property (and a re-wrapped `new Response()`
  // never gains one), so the bug was invisible to the suite. Faithfully
  // simulate the runtime by defining a null `webSocket` getter on
  // `Response.prototype` for the duration of the request — exactly what makes
  // `"webSocket" in res` true for every response in production.
  it("sets CORS headers in a runtime where every Response exposes a null webSocket", async () => {
    const { managementApp, env } = await getTestServer();

    const hadOwn = Object.prototype.hasOwnProperty.call(
      Response.prototype,
      "webSocket",
    );
    Object.defineProperty(Response.prototype, "webSocket", {
      configurable: true,
      get() {
        return null;
      },
    });

    try {
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

      // Without the fix, `isWebSocketUpgrade` would treat this ordinary response
      // as an upgrade and skip the entire CORS block — no headers at all.
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
      expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true",
      );
      expect(response.headers.get("Vary")).toContain("Origin");
    } finally {
      if (!hadOwn) {
        Reflect.deleteProperty(Response.prototype, "webSocket");
      }
    }
  });

  // Regression: a `tenantDispatch` middleware that returns a `fetch()`-style
  // response carries an *immutable* header guard. The CORS middleware appends
  // `Vary: Origin` (and, for an allowed origin, `Access-Control-*`) to the
  // response after `next()` — which throws "Can't modify immutable headers."
  // and turns every dispatched request into a 500 unless the CORS layer
  // re-wraps the immutable response first.
  describe("immutable dispatched response (tenantDispatch)", () => {
    // Simulate the immutable header guard a fetch()/WFP-dispatch response
    // carries: appending/setting/deleting a header throws.
    function immutableResponse(body: string, status: number): Response {
      const res = new Response(body, { status });
      const throwImmutable = () => {
        throw new TypeError("Can't modify immutable headers.");
      };
      for (const method of ["append", "set", "delete"] as const) {
        Object.defineProperty(res.headers, method, {
          value: throwImmutable,
          configurable: true,
        });
      }
      return res;
    }

    const tenantDispatch = async () =>
      immutableResponse("from-tenant-worker", 200);

    it("flows through CORS and returns the dispatched 200 without an Origin header", async () => {
      const { managementApp, env } = await getTestServer({ tenantDispatch });

      const response = await managementApp.request(
        "/clients",
        { method: "GET", headers: { "tenant-id": "tenantId" } },
        env,
      );

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("from-tenant-worker");
      // Vary: Origin is still appended (on the re-wrapped, mutable response).
      expect(response.headers.get("Vary")).toContain("Origin");
    });

    it("flows through CORS and returns the dispatched 200 with an allowed Origin header", async () => {
      const { managementApp, env } = await getTestServer({ tenantDispatch });

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

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("from-tenant-worker");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
        "https://example.com",
      );
      expect(response.headers.get("Vary")).toContain("Origin");
    });
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
