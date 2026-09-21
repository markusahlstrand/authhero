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
});
