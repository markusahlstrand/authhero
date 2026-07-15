import { describe, it, expect, vi } from "vitest";
import { createControlPlaneClient } from "../../src/helpers/control-plane-client";

/**
 * Minimal unsigned JWT — the client only reads `exp` to size its cache, it
 * never verifies (the control plane does that).
 */
function tokenWithExp(secondsFromNow: number): string {
  const payload = btoa(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
}

describe("createControlPlaneClient", () => {
  it("sends the bearer token and returns status + parsed body", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const client = createControlPlaneClient({
      baseUrl: "https://cp.test/",
      getServiceToken: async () => tokenWithExp(3600),
      fetchImpl,
    });

    const res = await client.request({
      tenantId: "t1",
      scope: "controlplane:custom_domains",
      method: "GET",
      path: "/api/v2/proxy/control-plane/custom-domains",
    });

    expect(res).toEqual({ status: 200, data: { ok: true } });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      "https://cp.test/api/v2/proxy/control-plane/custom-domains",
    );
    expect((init as RequestInit).headers).toMatchObject({
      authorization: expect.stringMatching(/^Bearer /),
    });
  });

  it("caches the token across requests for the same tenant and scope", async () => {
    const getServiceToken = vi.fn(async () => tokenWithExp(3600));
    const client = createControlPlaneClient({
      baseUrl: "https://cp.test",
      getServiceToken,
      fetchImpl: async () => new Response(null, { status: 204 }),
    });

    const req = {
      tenantId: "t1",
      scope: "controlplane:custom_domains",
      method: "GET" as const,
      path: "/x",
    };
    await client.request(req);
    await client.request(req);

    expect(getServiceToken).toHaveBeenCalledTimes(1);
  });

  it("mints separate tokens per tenant", async () => {
    const getServiceToken = vi.fn(async () => tokenWithExp(3600));
    const client = createControlPlaneClient({
      baseUrl: "https://cp.test",
      getServiceToken,
      fetchImpl: async () => new Response(null, { status: 204 }),
    });

    await client.request({
      tenantId: "t1",
      scope: "s",
      method: "GET",
      path: "/x",
    });
    await client.request({
      tenantId: "t2",
      scope: "s",
      method: "GET",
      path: "/x",
    });

    expect(getServiceToken).toHaveBeenCalledTimes(2);
  });

  it("re-mints once on a 401 so a key rotation isn't a user-visible failure", async () => {
    const getServiceToken = vi.fn(async () => tokenWithExp(3600));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    const client = createControlPlaneClient({
      baseUrl: "https://cp.test",
      getServiceToken,
      fetchImpl,
    });

    const res = await client.request({
      tenantId: "t1",
      scope: "s",
      method: "GET",
      path: "/x",
    });

    expect(res.status).toBe(200);
    expect(getServiceToken).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns 4xx/5xx to the caller instead of throwing", async () => {
    const client = createControlPlaneClient({
      baseUrl: "https://cp.test",
      getServiceToken: async () => tokenWithExp(3600),
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "conflict" }), { status: 409 }),
    });

    const res = await client.request({
      tenantId: "t1",
      scope: "s",
      method: "POST",
      path: "/x",
      body: { a: 1 },
    });

    expect(res.status).toBe(409);
    expect(res.data).toEqual({ error: "conflict" });
  });

  it("propagates a network failure", async () => {
    const client = createControlPlaneClient({
      baseUrl: "https://cp.test",
      getServiceToken: async () => tokenWithExp(3600),
      fetchImpl: async () => {
        throw new Error("network down");
      },
    });

    await expect(
      client.request({ tenantId: "t1", scope: "s", method: "GET", path: "/x" }),
    ).rejects.toThrow(/network down/);
  });
});
