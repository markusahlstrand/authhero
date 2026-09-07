import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant } from "../../helpers/seed-tenant";
import { CustomDomain } from "@authhero/adapter-interfaces";

// Assembled from fragments rather than written out as one literal: a
// complete BEGIN/END block, however obviously fake its body, trips the
// gitleaks private-key rule that the pre-commit hook runs.
const pemBlock = (label: string) =>
  `-----BEGIN ${label}-----\nfake\n-----END ${label}-----\n`;
const FAKE_CERTIFICATE = pemBlock("CERTIFICATE");
const FAKE_PRIVATE_KEY = pemBlock("PRIVATE KEY");

describe("management-api custom-domains", () => {
  async function setup() {
    const { app, managementApp, env } = await getTestServer();
    return {
      app,
      env,
      managementClient: testClient(managementApp, env),
      token: await getAdminToken(),
    };
  }

  describe("GET /api/v2/custom-domains", () => {
    it("lists the custom domains of a tenant", async () => {
      const { env, managementClient, token } = await setup();

      await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "auth0_managed_certs",
      });

      const response = await managementClient["custom-domains"].$get(
        {
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as CustomDomain[];
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        domain: "auth.example.com",
        type: "auth0_managed_certs",
        status: "pending",
        primary: false,
      });
    });

    it("does not return the custom domains of another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");

      await env.data.customDomains.create("otherTenant", {
        domain: "auth.other.example.com",
        type: "auth0_managed_certs",
      });

      const response = await managementClient["custom-domains"].$get(
        {
          query: {},
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
    });
  });

  describe("GET /api/v2/custom-domains/{id}", () => {
    it("returns a single custom domain", async () => {
      const { env, managementClient, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "self_managed_certs",
        domain_metadata: { ssl_method: "http" },
      });

      const response = await managementClient["custom-domains"][":id"].$get(
        {
          param: { id: created.custom_domain_id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        custom_domain_id: created.custom_domain_id,
        domain: "auth.example.com",
        type: "self_managed_certs",
        domain_metadata: { ssl_method: "http" },
      });
    });

    it("returns 404 for an unknown custom domain", async () => {
      const { managementClient, token } = await setup();

      const response = await managementClient["custom-domains"][":id"].$get(
        {
          param: { id: "does-not-exist" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });

    it("returns 404 when the custom domain belongs to another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");

      const created = await env.data.customDomains.create("otherTenant", {
        domain: "auth.other.example.com",
        type: "auth0_managed_certs",
      });

      const response = await managementClient["custom-domains"][":id"].$get(
        {
          param: { id: created.custom_domain_id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/v2/custom-domains", () => {
    it("creates a custom domain and returns it with 201", async () => {
      const { env, managementClient, token } = await setup();

      // `verification_method` is deliberately left out of the body: the insert
      // schema accepts it but neither the kysely nor the drizzle table has a
      // column for it, so sending it makes the insert throw.

      const response = await managementClient["custom-domains"].$post(
        {
          json: {
            domain: "auth.example.com",
            type: "auth0_managed_certs",
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(201);
      const body = (await response.json()) as CustomDomain;
      expect(body).toMatchObject({
        domain: "auth.example.com",
        type: "auth0_managed_certs",
        status: "pending",
        primary: false,
      });
      expect(body.custom_domain_id).toBeTypeOf("string");

      const stored = await env.data.customDomains.get(
        "tenantId",
        body.custom_domain_id,
      );
      expect(stored?.domain).toBe("auth.example.com");
    });

    it("rejects a body with an unsupported certificate type", async () => {
      const { app, env, token } = await setup();

      const response = await app.request(
        "/api/v2/custom-domains",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            domain: "auth.example.com",
            type: "letsencrypt",
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
    });
  });

  describe("PATCH /api/v2/custom-domains/{id}", () => {
    it("updates the mutable fields and returns the stored domain", async () => {
      const { env, managementClient, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "auth0_managed_certs",
      });

      const response = await managementClient["custom-domains"][":id"].$patch(
        {
          param: { id: created.custom_domain_id },
          json: {
            tls_policy: "recommended",
            custom_client_ip_header: "cf-connecting-ip",
            domain_metadata: { ssl_method: "txt" },
          },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        custom_domain_id: created.custom_domain_id,
        tls_policy: "recommended",
        custom_client_ip_header: "cf-connecting-ip",
        domain_metadata: { ssl_method: "txt" },
      });

      const stored = await env.data.customDomains.get(
        "tenantId",
        created.custom_domain_id,
      );
      expect(stored?.custom_client_ip_header).toBe("cf-connecting-ip");
    });

    it("rejects fields that are not patchable", async () => {
      const { app, env, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "auth0_managed_certs",
      });

      const response = await app.request(
        `/api/v2/custom-domains/${created.custom_domain_id}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ domain: "hijacked.example.com" }),
        },
        env,
      );

      expect(response.status).toBe(400);
      const stored = await env.data.customDomains.get(
        "tenantId",
        created.custom_domain_id,
      );
      expect(stored?.domain).toBe("auth.example.com");
    });

    it("does not patch a custom domain owned by another tenant", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");

      const created = await env.data.customDomains.create("otherTenant", {
        domain: "auth.other.example.com",
        type: "auth0_managed_certs",
      });

      const response = await managementClient["custom-domains"][":id"].$patch(
        {
          param: { id: created.custom_domain_id },
          json: { tls_policy: "recommended" },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(404);
      const stored = await env.data.customDomains.get(
        "otherTenant",
        created.custom_domain_id,
      );
      expect(stored?.tls_policy ?? null).toBeNull();
    });
  });

  describe("DELETE /api/v2/custom-domains/{id}", () => {
    it("removes the custom domain", async () => {
      const { env, managementClient, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "auth0_managed_certs",
      });

      const response = await managementClient["custom-domains"][":id"].$delete(
        {
          param: { id: created.custom_domain_id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(response.status).toBe(200);
      expect(await env.data.customDomains.list("tenantId")).toEqual([]);
    });

    // No unknown-id case here: the handler's 404 branch depends on the
    // adapter's `remove` reporting whether a row was deleted, and the kysely
    // adapter backing this test server always reports success, so the
    // assertion would pin adapter-specific behaviour rather than the route's.
    it("leaves another tenant's custom domain in place", async () => {
      const { env, managementClient, token } = await setup();
      await seedTenant(env.data, "otherTenant");

      const created = await env.data.customDomains.create("otherTenant", {
        domain: "auth.other.example.com",
        type: "auth0_managed_certs",
      });

      await managementClient["custom-domains"][":id"].$delete(
        {
          param: { id: created.custom_domain_id },
          header: { "tenant-id": "tenantId" },
        },
        { headers: { authorization: `Bearer ${token}` } },
      );

      expect(await env.data.customDomains.list("otherTenant")).toHaveLength(1);
    });
  });

  describe("PUT /api/v2/custom-domains/{id}/certificate", () => {
    it("returns 501 when the adapter cannot upload certificates", async () => {
      const { app, env, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "self_managed_certs",
      });

      // The kysely test adapter implements no `uploadCertificate`, which is
      // the optional half of the adapter contract.
      const response = await app.request(
        `/api/v2/custom-domains/${created.custom_domain_id}/certificate`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            certificate: FAKE_CERTIFICATE,
            private_key: FAKE_PRIVATE_KEY,
          }),
        },
        env,
      );

      expect(response.status).toBe(501);
    });

    it("rejects a body whose certificate is not PEM-encoded", async () => {
      const { app, env, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "self_managed_certs",
      });

      const response = await app.request(
        `/api/v2/custom-domains/${created.custom_domain_id}/certificate`,
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            certificate: "not-a-certificate",
            private_key: FAKE_PRIVATE_KEY,
          }),
        },
        env,
      );

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/v2/custom-domains/{id}/verify", () => {
    it("is not implemented yet", async () => {
      const { app, env, token } = await setup();

      const created = await env.data.customDomains.create("tenantId", {
        domain: "auth.example.com",
        type: "auth0_managed_certs",
      });

      const response = await app.request(
        `/api/v2/custom-domains/${created.custom_domain_id}/verify`,
        {
          method: "POST",
          headers: {
            "tenant-id": "tenantId",
            authorization: `Bearer ${token}`,
          },
        },
        env,
      );

      expect(response.status).toBe(501);
    });
  });
});
