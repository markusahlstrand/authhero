import { describe, expect, it } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { applyConfigMiddleware } from "../../src/middlewares/apply-config";
import { AuthHeroConfig, Bindings, Variables } from "../../src/types";

function fakeData(label: string): DataAdapters {
  // Only identity matters here — the handler never calls into the adapters.
  return { label } as unknown as DataAdapters;
}

describe("applyConfigMiddleware", () => {
  it("isolates per-request env writes when the runtime reuses one env object", async () => {
    const baseData = fakeData("base");
    const config: AuthHeroConfig = { dataAdapter: baseData };
    const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
    app.use("*", applyConfigMiddleware(config));

    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstWrote: () => void = () => {};
    const firstHasWritten = new Promise<void>((resolve) => {
      firstWrote = resolve;
    });

    app.get("/test/:id", async (ctx) => {
      const id = ctx.req.param("id");
      const own = fakeData(id);
      // Mirrors `ctx.env.data = composeAuthData({ ctx, ... })` in the routes.
      ctx.env.data = own;
      if (id === "first") {
        firstWrote();
        await firstGate;
      }
      return ctx.json({ same: ctx.env.data === own });
    });

    // Workers pass the same env object to every request in an isolate.
    const sharedEnv = { data: baseData } as unknown as Bindings;

    const first = app.request("/test/first", {}, sharedEnv);
    await firstHasWritten;
    // Second request runs to completion while the first is still in flight.
    const second = await app.request("/test/second", {}, sharedEnv);
    releaseFirst();

    expect(await second.json()).toEqual({ same: true });
    expect(await (await first).json()).toEqual({ same: true });
    // The runtime's env object itself is never mutated.
    expect(sharedEnv.data).toBe(baseData);
  });

  it("still exposes the configured data adapter when env has none", async () => {
    const baseData = fakeData("base");
    const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
    app.use("*", applyConfigMiddleware({ dataAdapter: baseData }));
    app.get("/", (ctx) => ctx.json({ same: ctx.env.data === baseData }));

    const res = await app.request("/", {}, {});
    expect(await res.json()).toEqual({ same: true });
  });

  it("sets ctx.var.data to env.data for routes that never compose", async () => {
    const configData = fakeData("config");
    const envData = fakeData("env");
    const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
    app.use("*", applyConfigMiddleware({ dataAdapter: configData }));
    app.get("/", (ctx) =>
      ctx.json({
        sameAsEnv: ctx.var.data === ctx.env.data,
        isConfig: ctx.var.data === configData,
        isEnv: ctx.var.data === envData,
      }),
    );

    const fromConfig = await app.request("/", {}, {});
    expect(await fromConfig.json()).toEqual({
      sameAsEnv: true,
      isConfig: true,
      isEnv: false,
    });

    const fromEnv = await app.request("/", {}, { data: envData });
    expect(await fromEnv.json()).toEqual({
      sameAsEnv: true,
      isConfig: false,
      isEnv: true,
    });
  });

  it("re-syncs ctx.var.data when a nested app runs the middleware again", async () => {
    const baseData = fakeData("base");
    const replaced = fakeData("replaced");
    const config: AuthHeroConfig = { dataAdapter: baseData };
    const outer = new OpenAPIHono<{
      Bindings: Bindings;
      Variables: Variables;
    }>();
    outer.use("*", applyConfigMiddleware(config));
    // Stands in for a consumer middleware (e.g. per-tenant database
    // isolation) that still writes the deprecated env alias.
    outer.use("*", async (ctx, next) => {
      ctx.env.data = replaced;
      await next();
    });
    const inner = new OpenAPIHono<{
      Bindings: Bindings;
      Variables: Variables;
    }>();
    inner.use(applyConfigMiddleware(config));
    inner.get("/", (ctx) => ctx.json({ same: ctx.var.data === replaced }));
    outer.route("/inner", inner);

    const res = await outer.request("/inner", {}, {});
    expect(await res.json()).toEqual({ same: true });
  });
});
