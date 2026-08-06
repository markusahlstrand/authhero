import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("management-api /spec", () => {
  // Guards against a schema that can't be serialized into the OpenAPI
  // document. `.doc("/spec")` regenerates the whole document from every
  // registered route on each request, so a single unserializable schema
  // (e.g. a bare `z.custom()` under Zod v4) turns the endpoint into a 500.
  it("serializes the OpenAPI document without throwing", async () => {
    const { app, env } = await getTestServer();

    const res = await app.request("/api/v2/spec", { method: "GET" }, env);

    expect(res.status).toBe(200);
    const spec = await res.json();
    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toBe("Management API");
  });
});
