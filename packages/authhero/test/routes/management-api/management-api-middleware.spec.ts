import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import type { MiddlewareHandler } from "hono";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";

describe("managementApiMiddleware", () => {
  it("runs after authentication, before the route handlers", async () => {
    const seen: { tenantId?: string; sub?: unknown; hasData: boolean }[] = [];
    const record: MiddlewareHandler = async (ctx, next) => {
      const user: unknown = ctx.get("user");
      seen.push({
        tenantId: ctx.get("tenant_id"),
        sub:
          typeof user === "object" && user !== null && "sub" in user
            ? user.sub
            : undefined,
        hasData: ctx.get("data") !== undefined,
      });
      await next();
    };
    const { managementApp, env } = await getTestServer({
      managementApiMiddleware: [record],
    });

    const response = await testClient(managementApp, env).roles.$get(
      { query: {}, header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${await getAdminToken()}` } },
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual([
      { tenantId: "tenantId", sub: "userId", hasData: true },
    ]);
  });

  it("can reject a request before the route runs", async () => {
    const deny: MiddlewareHandler = async (ctx, next) => {
      if (ctx.req.method === "DELETE") {
        return ctx.json({ message: "blocked by guard" }, 403);
      }
      await next();
    };
    const { managementApp, env } = await getTestServer({
      managementApiMiddleware: [deny],
    });
    const role = await env.data.roles.create("tenantId", { name: "keep-me" });

    const response = await testClient(managementApp, env).roles[":id"].$delete(
      { param: { id: role.id }, header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${await getAdminToken()}` } },
    );

    expect(response.status).toBe(403);
    expect(await env.data.roles.get("tenantId", role.id)).not.toBeNull();
  });

  it("does not run for unauthenticated requests", async () => {
    let ran = false;
    const { managementApp, env } = await getTestServer({
      managementApiMiddleware: [
        async (_ctx, next) => {
          ran = true;
          await next();
        },
      ],
    });

    const response = await testClient(managementApp, env).roles.$get({
      query: {},
      header: { "tenant-id": "tenantId" },
    });

    expect(response.status).toBe(401);
    expect(ran).toBe(false);
  });
});
