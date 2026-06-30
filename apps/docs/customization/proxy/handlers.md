---
title: Proxy — Handlers
description: The 12 built-in @authhero/proxy handlers (CORS, headers, auth, caching, and the five dispatch modes) plus the handler registry for custom handlers.
---

# Handlers

The proxy runs a per-route _handler chain_: an ordered list of middleware handlers followed by one terminal dispatch handler. This page is the reference for the built-in set and for registering your own.

## Built-in handlers

12 handlers ship in `@authhero/proxy` and are registered by `registerBuiltinHandlers(registry)`. Each handler's options are validated against a Zod schema when routes are built (during `HandlerRegistry.build(...)`, called as the per-host route list is compiled) — typos in the JSON fail loudly at route build time, before any request is served.

### Middleware handlers

These wrap the request/response without dispatching. Compose them before a terminal handler.

#### `cors`

CORS preflight + response headers. Validates that wildcard `*` is not combined with `allow_credentials`.

```json
{
  "type": "cors",
  "options": {
    "origins": ["https://app.acme.com", "https://*.acme.com"],
    "allow_credentials": true,
    "allow_headers": ["Authorization", "Content-Type"],
    "allow_methods": ["GET", "POST", "PUT", "DELETE"],
    "expose_headers": ["X-Request-Id"],
    "max_age": 86400
  }
}
```

#### `headers`

Set or remove request/response headers.

```json
{
  "type": "headers",
  "options": {
    "request": { "X-Tenant": "acme" },
    "remove_request": ["cookie"],
    "response": { "X-Powered-By": "AuthHero" },
    "remove_response": ["server", "x-powered-by"]
  }
}
```

#### `basic_auth`

HTTP Basic auth gate.

```json
{
  "type": "basic_auth",
  "options": {
    "username": "ops",
    "password": "<secret>",
    "realm": "AuthHero Internal"
  }
}
```

#### `cache`

Sets `Cache-Control` on the response if not already set. Cookies in the response downgrade visibility to `private`.

```json
{ "type": "cache", "options": { "ttl_seconds": 300 } }
```

#### `forwarded_headers`

Adds `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`, `X-Forwarded-Port` based on the incoming request. Use this when the upstream needs to know the original client.

```json
{ "type": "forwarded_headers", "options": {} }
```

#### `rewrite_cookies`

Rewrite cookie `Domain=` attributes on the response. Useful when the upstream sets cookies for its own domain but you want them to land on the custom domain.

#### `rewrite_location`

Rewrite the `Location` header on redirects so upstream-relative redirects become relative to the custom domain instead.

### Terminal handlers

These dispatch the request and produce a response. A route's `handlers` array should end with one of these.

#### `http`

Reverse-proxy to a fully-qualified HTTP(S) URL. Hop-by-hop headers (`connection`, `transfer-encoding`, etc.) are stripped.

```json
{
  "type": "http",
  "options": {
    "upstream_url": "https://account.acme.app",
    "preserve_host": false,
    "timeout_ms": 15000
  }
}
```

#### `service_binding`

Forward to a Cloudflare [service binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/). Same fetch shape as `http` but bypasses the public network. Requires `bindings: { <name>: env.<name> }` on `createProxyApp`.

```json
{
  "type": "service_binding",
  "options": {
    "binding": "ACCOUNT_API",
    "preserve_host": true
  }
}
```

#### `dispatch_namespace`

Forward to a script in a Cloudflare [dispatch namespace](https://developers.cloudflare.com/cloudflare-for-platforms/workers-for-platforms/configuration/dispatch-namespaces/) — the core of WFP. The script name supports `{tenant_id}`, `{custom_domain_id}`, `{domain}`, `{host}` placeholders.

```json
{
  "type": "dispatch_namespace",
  "options": {
    "binding": "DISPATCHER",
    "script_name": "tenant-{tenant_id}-auth",
    "cpu_ms": 50,
    "subrequests": 100
  }
}
```

`cpu_ms` and `subrequests` cap the script's resource limits (Cloudflare enforces lower bounds at the platform level).

#### `redirect`

Returns a 301/302/307/308 redirect. Defaults to 302.

```json
{
  "type": "redirect",
  "options": {
    "upstream_url": "https://www.acme.com",
    "status": 301,
    "preserve_path": true,
    "preserve_query": true
  }
}
```

#### `static`

Returns a fixed response. Useful for health checks or maintenance pages.

```json
{
  "type": "static",
  "options": {
    "status": 200,
    "headers": { "content-type": "text/plain" },
    "body": "ok"
  }
}
```

`json: <value>` is also accepted as a shorthand for a JSON body.

## Handler registry

Custom handlers extend the built-in set. Register them on a `HandlerRegistry` and pass it to `createProxyApp`:

```typescript
import {
  createProxyApp,
  defineHandler,
  HandlerRegistry,
  registerBuiltinHandlers,
} from "@authhero/proxy";
import { z } from "zod";

const myLoggingHandler = defineHandler({
  type: "logging",
  optionsSchema: z.object({ prefix: z.string().default("[proxy]") }),
  build(options) {
    return async (c, next) => {
      console.log(options.prefix, c.req.method, c.req.url);
      await next();
    };
  },
});

const registry = new HandlerRegistry({ /* bindings */ });
registerBuiltinHandlers(registry);
registry.add(myLoggingHandler);

createProxyApp({ data, registry });
```

Routes can now use `{ "type": "logging", "options": { "prefix": "[acme]" } }`.

