import type { StaticProxyAdapterOptions } from "@authhero/proxy";

// Map each public hostname to the routes the proxy should serve for it.
// Routes are matched in priority order (lower priority wins). The path
// pattern in `match.path` supports `*` and `:param` segments (Hono syntax).
//
// Each route is an ordered list of handlers. The last handler is the
// terminal — it produces the response (e.g. `http`, `redirect`, `static`,
// `service_binding`). Earlier handlers wrap it, like Hono middleware.
//
// Edit this file to add your hosts, then re-deploy.
export const proxyConfig: StaticProxyAdapterOptions = {
  hosts: {
    "id.example.com": {
      tenant_id: "example",
      routes: [
        {
          match: { path: "/*" },
          handlers: [
            {
              type: "http",
              options: {
                upstream_url: "https://upstream.example.com",
                preserve_host: false,
              },
            },
          ],
        },
      ],
    },
  },
};
