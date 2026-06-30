---
title: Proxy — API reference
description: Exports from @authhero/proxy, the kysely/drizzle/aws proxy data adapters, and the authhero control-plane KV publisher.
---

# API reference


## From `@authhero/proxy`

```typescript
// App factory — main entry point
export { createProxyApp } from "@authhero/proxy";
export type { ProxyAppOptions } from "@authhero/proxy";

// Data-plane primitives (use directly when embedding in a larger Hono app)
export {
  createProxyDataPlaneRouter,
  createProxyDataPlaneHandler,
} from "@authhero/proxy";
export type { ProxyDataPlaneOptions } from "@authhero/proxy";

// Adapter interface
export type {
  ProxyDataAdapter,
  ProxyRoutesAdapter,
  ResolvedHost,
} from "@authhero/proxy";

// In-memory adapter for static configuration / dev
export { createStaticProxyAdapter, httpRoute } from "@authhero/proxy";
export type {
  StaticProxyAdapterOptions,
  StaticHostConfig,
  StaticRouteInput,
} from "@authhero/proxy";

// HTTP adapter for cross-account / cross-DB proxy deployments
export { createHttpProxyAdapter } from "@authhero/proxy";
export type { HttpProxyAdapterOptions } from "@authhero/proxy";

// KV adapter — read resolved host blobs from a Cloudflare KV namespace
// (the read side of Shape 3b). Pair with the control-plane publisher below.
export {
  createKvProxyAdapter,
  buildKvHostKey,
  DEFAULT_KV_HOST_KEY_PREFIX,
} from "@authhero/proxy";
export type {
  KvProxyAdapterOptions,
  KvNamespaceReader,
  KvNamespaceWriter,
} from "@authhero/proxy";

// Host caches
export { createInMemoryHostCache } from "@authhero/proxy";
export type { HostCacheOptions, HostResolverCache } from "@authhero/proxy";
// Generic CacheAdapter wrapper with stale-while-revalidate (preferred).
// Pair with createCloudflareCache from @authhero/cloudflare-adapter, a Redis
// adapter, or any other CacheAdapter implementation.
export {
  createCacheAdapterHostCache,
  buildCacheAdapterKey,
} from "@authhero/proxy";
export type { CacheAdapterHostCacheOptions } from "@authhero/proxy";
// Deprecated: use createCacheAdapterHostCache instead.
export {
  createCacheApiHostCache,
  buildCacheApiKey,
} from "@authhero/proxy";
export type { CacheApiHostCacheOptions } from "@authhero/proxy";

// Handler registry and built-in handlers
export {
  HandlerRegistry,
  defineHandler,
  registerBuiltinHandlers,
  corsHandler,
  basicAuthHandler,
  headersHandler,
  cacheHandler,
  forwardedHeadersHandler,
  rewriteCookiesHandler,
  rewriteLocationHandler,
  httpHandler,
  serviceBindingHandler,
  dispatchNamespaceHandler,
  redirectHandler,
  staticHandler,
} from "@authhero/proxy";
export type {
  HandlerDefinition,
  HandlerBuildContext,
} from "@authhero/proxy";

// Matching utilities (exposed for testing and custom data adapters)
export {
  compileHostApp,
  sortRoutes,
  matchesHost,
  matchesAnyHost,
  buildMatchFilter,
} from "@authhero/proxy";

// Re-exported types and Zod schemas (originally from @authhero/adapter-interfaces)
export type {
  ProxyRoute,
  ProxyRouteInsert,
  ProxyRouteUpdate,
  RouteMatch,
  HandlerConfig,
} from "@authhero/proxy";
export {
  proxyRouteSchema,
  proxyRouteInsertSchema,
  proxyRouteUpdateSchema,
  matchSchema,
  handlerConfigSchema,
} from "@authhero/proxy";
```

## From `@authhero/kysely-adapter` / `@authhero/drizzle`

```typescript
// Kysely or Drizzle implementation of ProxyDataAdapter (CRUD + resolveHost)
export { createProxyDataAdapter } from "@authhero/kysely-adapter";
// or
export { createProxyDataAdapter } from "@authhero/drizzle";
```

`@authhero/aws` exposes an equivalent `createProxyDataAdapter` against its own schema.

## From `authhero` (control-plane KV publisher)

```typescript
// Wrap customDomains + proxyRoutes so writes publish the recomputed
// ResolvedHost to a KV namespace (the write side of Shape 3b).
export { wrapProxyAdaptersWithKvPublish } from "authhero";
export type { KvPublishOptions, WrappedProxyAdapters } from "authhero";

// One-time backfill + periodic reconcile of existing hosts into KV.
export { backfillProxyHostsToKv } from "authhero";
export type { BackfillProxyHostsOptions, BackfillResult } from "authhero";
```

