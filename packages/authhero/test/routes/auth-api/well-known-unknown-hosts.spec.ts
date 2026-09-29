import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";

// ISSUER in the test server is http://localhost:3000/.
async function setup({ rejectUnknownHosts }: { rejectUnknownHosts: boolean }) {
  const server = await getTestServer();
  server.env.rejectUnknownHosts = rejectUnknownHosts;
  await server.env.data.customDomains.create("tenantId", {
    domain: "login.example.com",
    custom_domain_id: "custom-domain-id",
    type: "auth0_managed_certs",
  });
  await server.env.data.tenants.create({
    id: "acme",
    friendly_name: "Acme",
    audience: "https://acme.example.com",
    sender_email: "login@example.com",
    sender_name: "Acme",
  });
  const client = testClient(server.oauthApp, server.env);

  return {
    jwks: (headers: Record<string, string>) =>
      client[".well-known"]["jwks.json"].$get({ param: {} }, { headers }),
    openidConfiguration: (headers: Record<string, string>) =>
      client[".well-known"]["openid-configuration"].$get(
        { param: {} },
        { headers },
      ),
  };
}

describe("/.well-known with rejectUnknownHosts", () => {
  it("serves any host when the option is off", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: false });

    const response = await jwks({ host: "unknown.example.org" });

    expect(response.status).toBe(200);
  });

  it("returns 404 for a host the deployment doesn't own", async () => {
    const { jwks, openidConfiguration } = await setup({
      rejectUnknownHosts: true,
    });

    expect((await jwks({ host: "unknown.example.org" })).status).toBe(404);
    expect(
      (await openidConfiguration({ host: "unknown.example.org" })).status,
    ).toBe(404);
  });

  it("serves the ISSUER host", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: true });

    const response = await jwks({ host: "localhost:3000" });

    expect(response.status).toBe(200);
  });

  it("serves the subdomain of an existing tenant", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: true });

    const response = await jwks({ host: "acme.localhost:3000" });

    expect(response.status).toBe(200);
  });

  it("returns 404 for a deeper subdomain of the ISSUER host", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: true });

    const response = await jwks({ host: "a.acme.localhost:3000" });

    expect(response.status).toBe(404);
  });

  it("serves a registered custom domain, directly or proxied", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: true });

    expect((await jwks({ host: "login.example.com" })).status).toBe(200);
    expect(
      (
        await jwks({
          host: "proxy.internal",
          "x-forwarded-host": "login.example.com",
        })
      ).status,
    ).toBe(200);
  });

  it("checks the forwarded host, not a known backend host behind it", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: true });

    // Known ISSUER host as the backend host.
    expect(
      (
        await jwks({
          host: "localhost:3000",
          "x-forwarded-host": "unknown.example.org",
        })
      ).status,
    ).toBe(404);
    // Registered custom domain as the backend host: tenantMiddleware resolves
    // it as custom_domain, which must not vouch for the forwarded alias.
    expect(
      (
        await jwks({
          host: "login.example.com",
          "x-forwarded-host": "unknown.example.org",
        })
      ).status,
    ).toBe(404);
  });

  it("does not let a tenant-id header vouch for an unknown host", async () => {
    const { jwks } = await setup({ rejectUnknownHosts: true });

    expect(
      (await jwks({ host: "unknown.example.org", "tenant-id": "tenantId" }))
        .status,
    ).toBe(404);
    expect(
      (await jwks({ host: "login.example.com", "tenant-id": "tenantId" }))
        .status,
    ).toBe(200);
  });
});
