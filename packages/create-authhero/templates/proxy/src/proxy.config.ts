import type { StaticProxyAdapterOptions } from "@authhero/proxy";

// Map each public hostname to the routes the proxy should serve for it.
// Routes are matched in priority order (lower priority wins). The path
// pattern supports `*` and `:param` segments.
//
// Edit this file to add your hosts, then re-deploy.
export const proxyConfig: StaticProxyAdapterOptions = {
  hosts: {
    "id.example.com": {
      tenant_id: "example",
      routes: [
        {
          path_pattern: "/*",
          upstream_type: "http",
          upstream_url: "https://upstream.example.com",
          preserve_host: false,
        },
      ],
    },
  },
};
