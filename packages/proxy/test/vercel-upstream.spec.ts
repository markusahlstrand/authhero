import { describe, it, expect, vi, afterEach } from "vitest";
import { createProxyApp } from "../src/app";
import { createStaticProxyAdapter, httpRoute } from "../src/static";

// End-to-end-ish test: a proxy configured with the static adapter forwards
// `acme.example.com` to a Vercel preview deployment, rewriting the host header
// to the upstream's hostname and preserving the original path + query.
describe("proxy → Vercel preview upstream", () => {
  const PUBLIC_HOST = "acme.example.com";
  const UPSTREAM =
    "https://acme---account2-git-feat-account3.vercel.sesamy.dev";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function buildApp() {
    return createProxyApp({
      data: createStaticProxyAdapter({
        hosts: {
          [PUBLIC_HOST]: {
            tenant_id: "acme",
            routes: [httpRoute(UPSTREAM)],
          },
        },
      }),
    });
  }

  it("forwards a request to the Vercel preview origin", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    const app = buildApp();
    const res = await app.request(
      `https://${PUBLIC_HOST}/login?return_to=/home`,
      { headers: { host: PUBLIC_HOST } },
    );

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const calledUrl = fetchMock.mock.calls[0]![0] as string;
    expect(calledUrl).toBe(`${UPSTREAM}/login?return_to=/home`);

    const calledInit = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = calledInit.headers as Headers;
    expect(headers.get("host")).toBe(
      "acme---account2-git-feat-account3.vercel.sesamy.dev",
    );
    expect(headers.get("x-forwarded-host")).toBe(PUBLIC_HOST);
  });

  it("returns 404 for an unconfigured host", async () => {
    const app = buildApp();
    const res = await app.request("https://unknown.example.com/", {
      headers: { host: "unknown.example.com" },
    });
    expect(res.status).toBe(404);
  });
});
