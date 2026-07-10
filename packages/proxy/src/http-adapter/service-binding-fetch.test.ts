import { describe, it, expect, vi } from "vitest";
import type { ResolvedHost } from "../adapter";
import { createHttpProxyAdapter } from "./index";
import {
  createServiceBindingFetch,
  type ServiceBindingFetcher,
} from "./service-binding-fetch";

const resolved: ResolvedHost = {
  tenant_id: "wfp2",
  custom_domain_id: "cd1",
  domain: "wfp2.token.sesamy.com",
  routes: [],
};

function fakeFetcher(
  handler: (req: Request) => Response | Promise<Response>,
): ServiceBindingFetcher & { requests: Request[] } {
  const requests: Request[] = [];
  return {
    requests,
    fetch(req: Request) {
      requests.push(req);
      return Promise.resolve(handler(req));
    },
  };
}

describe("createServiceBindingFetch", () => {
  it("routes a (url, init) call through the binding as a Request", async () => {
    const fetcher = fakeFetcher(() => new Response("ok", { status: 200 }));
    const bindingFetch = createServiceBindingFetch(fetcher);

    const res = await bindingFetch("https://ignored.example/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credentials" }),
    });

    expect(res.status).toBe(200);
    expect(fetcher.requests).toHaveLength(1);
    const [req] = fetcher.requests;
    if (!req) throw new Error("no request captured");
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://ignored.example/oauth/token");
    expect(req.headers.get("content-type")).toBe("application/json");
    expect(await req.text()).toBe(
      JSON.stringify({ grant_type: "client_credentials" }),
    );
  });

  it("passes an already-built Request through untouched", async () => {
    const fetcher = fakeFetcher(() => new Response(null, { status: 204 }));
    const bindingFetch = createServiceBindingFetch(fetcher);
    const original = new Request("https://ignored.example/x");

    await bindingFetch(original);

    expect(fetcher.requests[0]).toBe(original);
  });
});

describe("createHttpProxyAdapter with a service-binding fetch", () => {
  it("resolves the control plane over the binding, never the public edge", async () => {
    // A stand-in for `env.AUTH2`: answers the token + resolveHost calls and
    // records every host it was asked for.
    const seenHosts: string[] = [];
    const fetcher = fakeFetcher((req) => {
      const url = new URL(req.url);
      seenHosts.push(url.host);
      if (url.pathname === "/oauth/token") {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      if (url.pathname.startsWith("/api/v2/proxy/control-plane/hosts/")) {
        expect(req.headers.get("authorization")).toBe("Bearer tok");
        return Response.json(resolved);
      }
      return new Response("not found", { status: 404 });
    });

    // A global fetch that MUST never be called — its invocation would mean the
    // control-plane call escaped to the public edge (the loop we prevent).
    const globalFetch = vi.spyOn(globalThis, "fetch");

    const adapter = createHttpProxyAdapter({
      // Deliberately on the wildcard the proxy itself serves.
      baseUrl: "https://controlplane.token.sesamy.com",
      clientId: "proxy",
      clientSecret: "secret",
      fetch: createServiceBindingFetch(fetcher),
    });

    const out = await adapter.resolveHost("wfp2.token.sesamy.com");

    expect(out).toEqual(resolved);
    expect(globalFetch).not.toHaveBeenCalled();
    // Every hop stayed on the binding, regardless of the wildcard baseUrl.
    expect(seenHosts).toEqual([
      "controlplane.token.sesamy.com",
      "controlplane.token.sesamy.com",
    ]);
    globalFetch.mockRestore();
  });
});
