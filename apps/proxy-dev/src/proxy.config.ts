import type { StaticProxyAdapterOptions } from "@authhero/proxy";

// Local proxy config for development.
//
// `wrangler dev` serves on http://localhost:8787, so the incoming Host header
// is "localhost:8787" — that's the key the static adapter matches on. The
// second entry, "acme.example.com", is for testing host-header overrides:
//
//   curl http://localhost:8787/ -H "Host: acme.example.com"
//
// Both forward to the same Vercel preview deployment.
const VERCEL_UPSTREAM =
  "https://acme---account2-git-feat-account3.vercel.sesamy.dev";

export const proxyConfig: StaticProxyAdapterOptions = {
  hosts: {
    "localhost:8787": {
      tenant_id: "dev",
      routes: [
        {
          path_pattern: "/*",
          upstream_type: "http",
          upstream_url: VERCEL_UPSTREAM,
        },
      ],
    },
    "acme.example.com": {
      tenant_id: "acme",
      routes: [
        {
          path_pattern: "/*",
          upstream_type: "http",
          upstream_url: VERCEL_UPSTREAM,
        },
      ],
    },
  },
};
