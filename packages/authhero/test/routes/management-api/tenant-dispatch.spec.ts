import { describe, it, expect } from "vitest";
import type { MiddlewareHandler } from "hono";
import { getTestServer } from "../../helpers/test-server";

describe("management-api tenantDispatch", () => {
  // A stand-in for `@authhero/cloudflare-adapter`'s wfp-forward middleware:
  // forwards (returns a Response) when a `tenant-id` header is present and
  // names a non-control-plane tenant; otherwise serves locally via next().
  const fakeForward: MiddlewareHandler = async (c, next) => {
    const tenantId = c.req.header("tenant-id");
    if (tenantId && tenantId !== "control-plane") {
      return new Response(`forwarded:${tenantId}`, {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    return next();
  };

  it("wraps a dispatched response with the central CORS headers", async () => {
    const { managementApp, env } = await getTestServer({
      tenantDispatch: fakeForward,
      allowedOrigins: ["https://admin.example.com"],
    });

    const response = await managementApp.request(
      "/clients",
      {
        method: "GET",
        headers: {
          Origin: "https://admin.example.com",
          "tenant-id": "acme",
        },
      },
      env,
    );

    // The dispatch middleware short-circuited auth and served the tenant
    // worker's response...
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("forwarded:acme");
    // ...and the management CORS middleware (which it is mounted after) applied
    // the CORS headers to that dispatched response — the whole point of #969.
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://admin.example.com",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
    expect(response.headers.get("Vary")).toContain("Origin");
  });

  it("falls through to the local pipeline when not dispatched", async () => {
    const { managementApp, env } = await getTestServer({
      tenantDispatch: fakeForward,
      allowedOrigins: ["https://admin.example.com"],
    });

    // A control-plane request is not forwarded, so it hits the normal
    // auth/tenant chain and is rejected for lack of a token (401) rather than
    // returning the dispatched body.
    const response = await managementApp.request(
      "/clients",
      {
        method: "GET",
        headers: {
          Origin: "https://admin.example.com",
          "tenant-id": "control-plane",
        },
      },
      env,
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("forwarded:");
  });
});
