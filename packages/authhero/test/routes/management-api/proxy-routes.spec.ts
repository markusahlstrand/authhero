import { describe, it, expect } from "vitest";
import { ProxyRoute } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { seedTenant } from "../../helpers/seed-tenant";

type ListBody = {
  proxy_routes: ProxyRoute[];
  start: number;
  limit: number;
  length: number;
};

// `/proxy-routes` is mounted at runtime only when the adapter exposes
// `proxyRoutes`, so it is absent from the typed hono client. Use raw requests.
describe("management-api proxy-routes", () => {
  async function setup() {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const proxyRoutes = env.data.proxyRoutes;
    if (!proxyRoutes) {
      throw new Error("test adapter does not expose proxyRoutes");
    }

    const request = (
      path: string,
      init: { method?: string; body?: unknown; tenantId?: string } = {},
    ) =>
      managementApp.request(
        `/proxy-routes${path}`,
        {
          method: init.method ?? "GET",
          headers: {
            "tenant-id": init.tenantId ?? "tenantId",
            authorization: `Bearer ${token}`,
            ...(init.body !== undefined
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(init.body !== undefined
            ? { body: JSON.stringify(init.body) }
            : {}),
        },
        env,
      );

    return { env, proxyRoutes, request };
  }

  const baseRoute = {
    custom_domain_id: "cd_1",
    priority: 10,
    match: { path: "/api/*", methods: ["GET"] },
    handlers: [{ type: "proxy", options: { target: "https://api.example" } }],
  };

  describe("POST /api/v2/proxy-routes", () => {
    it("creates a route scoped to the tenant", async () => {
      const { proxyRoutes, request } = await setup();

      const response = await request("", { method: "POST", body: baseRoute });

      expect(response.status).toBe(201);
      const body = (await response.json()) as ProxyRoute;
      expect(body).toMatchObject({
        tenant_id: "tenantId",
        custom_domain_id: "cd_1",
        priority: 10,
        match: { path: "/api/*", methods: ["GET"] },
        handlers: [
          { type: "proxy", options: { target: "https://api.example" } },
        ],
      });
      expect(body.id).toEqual(expect.any(String));
      expect(body.created_at).toEqual(expect.any(String));
      expect(body.updated_at).toEqual(expect.any(String));

      const stored = await proxyRoutes.get("tenantId", body.id);
      expect(stored?.custom_domain_id).toBe("cd_1");
    });

    it("applies the schema defaults for priority, match path and handler options", async () => {
      const { request } = await setup();

      const response = await request("", {
        method: "POST",
        body: {
          custom_domain_id: "cd_1",
          match: {},
          handlers: [{ type: "static" }],
        },
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as ProxyRoute;
      expect(body.priority).toBe(100);
      expect(body.match).toEqual({ path: "/*" });
      expect(body.handlers).toEqual([{ type: "static", options: {} }]);
    });

    it("rejects a route without handlers", async () => {
      const { request } = await setup();

      const response = await request("", {
        method: "POST",
        body: { custom_domain_id: "cd_1", match: {}, handlers: [] },
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v2/proxy-routes", () => {
    it("lists routes ordered by priority with a pagination envelope", async () => {
      const { proxyRoutes, request } = await setup();
      await proxyRoutes.create("tenantId", {
        ...baseRoute,
        priority: 20,
      });
      await proxyRoutes.create("tenantId", {
        ...baseRoute,
        priority: 5,
      });

      const response = await request("");

      expect(response.status).toBe(200);
      const body = (await response.json()) as ListBody;
      expect(body.proxy_routes.map((r) => r.priority)).toEqual([5, 20]);
      expect(body).toMatchObject({ start: 0, limit: 50, length: 2 });
    });

    it("filters by custom_domain_id and honours page/per_page", async () => {
      const { proxyRoutes, request } = await setup();
      await proxyRoutes.create("tenantId", {
        ...baseRoute,
        custom_domain_id: "cd_1",
        priority: 1,
      });
      await proxyRoutes.create("tenantId", {
        ...baseRoute,
        custom_domain_id: "cd_1",
        priority: 2,
      });
      await proxyRoutes.create("tenantId", {
        ...baseRoute,
        custom_domain_id: "cd_2",
        priority: 3,
      });

      const filtered = await request("?custom_domain_id=cd_2");
      expect(filtered.status).toBe(200);
      const filteredBody = (await filtered.json()) as ListBody;
      expect(filteredBody.proxy_routes.map((r) => r.priority)).toEqual([3]);

      const paged = await request("?page=1&per_page=1");
      expect(paged.status).toBe(200);
      const pagedBody = (await paged.json()) as ListBody;
      expect(pagedBody.proxy_routes.map((r) => r.priority)).toEqual([2]);
      expect(pagedBody).toMatchObject({ start: 1, limit: 1, length: 1 });
    });

    it("rejects a per_page above the cap", async () => {
      const { request } = await setup();

      const response = await request("?per_page=201");

      expect(response.status).toBe(400);
    });

    it("does not list routes belonging to another tenant", async () => {
      const { env, proxyRoutes, request } = await setup();
      await seedTenant(env.data, "otherTenant");
      await proxyRoutes.create("otherTenant", baseRoute);

      const response = await request("");

      expect(response.status).toBe(200);
      const body = (await response.json()) as ListBody;
      expect(body.proxy_routes).toEqual([]);
      expect(body.length).toBe(0);
    });
  });

  describe("GET /api/v2/proxy-routes/{id}", () => {
    it("returns the stored route", async () => {
      const { proxyRoutes, request } = await setup();
      const created = await proxyRoutes.create("tenantId", baseRoute);

      const response = await request(`/${created.id}`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as ProxyRoute;
      expect(body).toMatchObject({
        id: created.id,
        tenant_id: "tenantId",
        custom_domain_id: "cd_1",
        match: { path: "/api/*", methods: ["GET"] },
      });
    });

    it("returns 404 for an unknown id", async () => {
      const { request } = await setup();

      const response = await request("/does-not-exist");

      expect(response.status).toBe(404);
    });

    it("returns 404 when the route belongs to another tenant", async () => {
      const { env, proxyRoutes, request } = await setup();
      await seedTenant(env.data, "otherTenant");
      const created = await proxyRoutes.create("otherTenant", baseRoute);

      const response = await request(`/${created.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /api/v2/proxy-routes/{id}", () => {
    it("updates only the supplied fields", async () => {
      const { proxyRoutes, request } = await setup();
      const created = await proxyRoutes.create("tenantId", baseRoute);

      const response = await request(`/${created.id}`, {
        method: "PATCH",
        body: { priority: 1, match: { path: "/v2/*" } },
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as ProxyRoute;
      expect(body).toMatchObject({
        id: created.id,
        custom_domain_id: "cd_1",
        priority: 1,
        match: { path: "/v2/*" },
        handlers: baseRoute.handlers,
      });

      const stored = await proxyRoutes.get("tenantId", created.id);
      expect(stored?.priority).toBe(1);
      expect(stored?.match).toEqual({ path: "/v2/*" });
      expect(stored?.handlers).toEqual(baseRoute.handlers);
    });

    it("returns 404 for an unknown id", async () => {
      const { request } = await setup();

      const response = await request("/does-not-exist", {
        method: "PATCH",
        body: { priority: 1 },
      });

      expect(response.status).toBe(404);
    });

    it("returns 404 and leaves another tenant's route untouched", async () => {
      const { env, proxyRoutes, request } = await setup();
      await seedTenant(env.data, "otherTenant");
      const created = await proxyRoutes.create("otherTenant", baseRoute);

      const response = await request(`/${created.id}`, {
        method: "PATCH",
        body: { priority: 1 },
      });

      expect(response.status).toBe(404);
      const stored = await proxyRoutes.get("otherTenant", created.id);
      expect(stored?.priority).toBe(10);
    });
  });

  describe("DELETE /api/v2/proxy-routes/{id}", () => {
    it("removes the route", async () => {
      const { proxyRoutes, request } = await setup();
      const created = await proxyRoutes.create("tenantId", baseRoute);

      const response = await request(`/${created.id}`, { method: "DELETE" });

      expect(response.status).toBe(204);
      expect(await proxyRoutes.get("tenantId", created.id)).toBeNull();
    });

    it("returns 404 for an unknown id", async () => {
      const { request } = await setup();

      const response = await request("/does-not-exist", { method: "DELETE" });

      expect(response.status).toBe(404);
    });

    it("returns 404 and keeps another tenant's route", async () => {
      const { env, proxyRoutes, request } = await setup();
      await seedTenant(env.data, "otherTenant");
      const created = await proxyRoutes.create("otherTenant", baseRoute);

      const response = await request(`/${created.id}`, { method: "DELETE" });

      expect(response.status).toBe(404);
      expect(await proxyRoutes.get("otherTenant", created.id)).not.toBeNull();
    });
  });

  it("rejects a token without the proxy_routes scopes", async () => {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken({ permissions: ["read:hooks"] });

    const response = await managementApp.request(
      "/proxy-routes",
      {
        headers: {
          "tenant-id": "tenantId",
          authorization: `Bearer ${token}`,
        },
      },
      env,
    );

    expect(response.status).toBe(403);
  });
});
