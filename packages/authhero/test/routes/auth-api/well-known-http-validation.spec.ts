import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";

describe("/.well-known HTTP domain validation", () => {
  it("should return 404 when no domain header is present", async () => {
    const { oauthApp, env } = await getTestServer();

    const response = await oauthApp.request(
      "/.well-known/acme-challenge/testtoken",
      { method: "GET" },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 when domain is not a registered custom domain", async () => {
    const { oauthApp, env } = await getTestServer();

    const response = await oauthApp.request(
      "/.well-known/acme-challenge/testtoken",
      {
        method: "GET",
        headers: { "x-forwarded-host": "unknown.example.com" },
      },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 when domain has no HTTP verification methods", async () => {
    const { oauthApp, env } = await getTestServer();

    await env.data.customDomains.create("tenantId", {
      custom_domain_id: "test-domain-id",
      domain: "custom.example.com",
      type: "auth0_managed_certs",
    });

    const response = await oauthApp.request(
      "/.well-known/acme-challenge/testtoken",
      {
        method: "GET",
        headers: { "x-forwarded-host": "custom.example.com" },
      },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 when path does not match any HTTP verification method", async () => {
    const { oauthApp, env } = await getTestServer();

    await env.data.customDomains.create("tenantId", {
      custom_domain_id: "test-domain-id-2",
      domain: "custom2.example.com",
      type: "auth0_managed_certs",
    });

    await env.data.customDomains.update("tenantId", "test-domain-id-2", {
      verification: {
        methods: [
          {
            name: "http",
            http_body: "expected-body",
            http_url:
              "http://custom2.example.com/.well-known/acme-challenge/correcttoken",
          },
        ],
      },
    });

    const response = await oauthApp.request(
      "/.well-known/acme-challenge/wrongtoken",
      {
        method: "GET",
        headers: { "x-forwarded-host": "custom2.example.com" },
      },
      env,
    );

    expect(response.status).toBe(404);
  });

  it("should return the http_body for a matching HTTP verification method", async () => {
    const { oauthApp, env } = await getTestServer();

    await env.data.customDomains.create("tenantId", {
      custom_domain_id: "test-domain-id-3",
      domain: "custom3.example.com",
      type: "auth0_managed_certs",
    });

    await env.data.customDomains.update("tenantId", "test-domain-id-3", {
      verification: {
        methods: [
          {
            name: "http",
            http_body: "abc123validationbody",
            http_url:
              "http://custom3.example.com/.well-known/acme-challenge/mytoken",
          },
        ],
      },
    });

    const response = await oauthApp.request(
      "/.well-known/acme-challenge/mytoken",
      {
        method: "GET",
        headers: { "x-forwarded-host": "custom3.example.com" },
      },
      env,
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe("abc123validationbody");
    expect(response.headers.get("content-type")).toContain("text/plain");
  });

  it("should match by path when multiple HTTP methods are present", async () => {
    const { oauthApp, env } = await getTestServer();

    await env.data.customDomains.create("tenantId", {
      custom_domain_id: "test-domain-id-4",
      domain: "custom4.example.com",
      type: "auth0_managed_certs",
    });

    await env.data.customDomains.update("tenantId", "test-domain-id-4", {
      verification: {
        methods: [
          {
            name: "http",
            http_body: "ssl-body",
            http_url:
              "http://custom4.example.com/.well-known/cf-custom-hostname-challenge/ssltoken",
          },
          {
            name: "http",
            http_body: "acme-body",
            http_url:
              "http://custom4.example.com/.well-known/acme-challenge/acmetoken",
          },
        ],
      },
    });

    const response = await oauthApp.request(
      "/.well-known/acme-challenge/acmetoken",
      {
        method: "GET",
        headers: { "x-forwarded-host": "custom4.example.com" },
      },
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("acme-body");
  });
});
