import { Context } from "hono";
import { CacheAdapter, DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { addDataHooks } from "../hooks";
import { addCaching } from "./cache-wrapper";
import { addRequestScopedDedup } from "./request-scoped-dedup";
import { addBundleWritePurge } from "./bundle-write-purge";
import { withClientBundle } from "./with-client-bundle";
import { addTimingLogs } from "./server-timing";
import { BUNDLE_ENTITIES } from "./client-bundle";

/**
 * Composes the per-request data-adapter wrapper stack used by every app
 * that serves authenticated/tenant-scoped traffic (auth-api, universal-
 * login v1/v2, saml). Keeps the layer order — and the safety constraints
 * between layers — in one place so individual apps can't drift.
 *
 * Layering (outermost first; that's the order callers hit on each read):
 *   addTimingLogs        — server-timing instrumentation
 *   withClientBundle     — L0: per-(tenant_id, client_id) snapshot
 *   addBundleWritePurge  — local-edge bundle invalidation on writes
 *   addRequestScopedDedup — L1: in-request Promise memoization
 *   addCaching           — L2: cross-request cache (CF Cache API in prod)
 *   addDataHooks         — user lifecycle hooks
 *   raw dataAdapter      — underlying DB
 *
 * Apps declare only their `nonBundleEntities` — the long-tail entities they
 * read that aren't covered by {@link BUNDLE_ENTITIES}. Those get cross-
 * request caching via L2 (`addCaching`). Bundle entities are intentionally
 * NOT in L2 — the bundle (L0) is their cross-request cache, and double-
 * caching them under per-entity keys would waste edge storage and create a
 * second invalidation surface.
 *
 * L1 (`addRequestScopedDedup`) covers both sets, since in-request dedup is
 * essentially free and a useful backstop for the rare bundle fall-through
 * (mismatched ctx.var args, non-default list params).
 *
 * Transactional entities (sessions, codes, loginSessions, users, refresh-
 * Tokens, clientGrants, logs, …) MUST NOT be included in `nonBundleEntities`
 * — see request-scoped-dedup.ts for the rationale.
 */
export function composeAuthData(opts: {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  rawData: DataAdapters;
  cacheAdapter: CacheAdapter;
  defaultTtl: number;
  /** Entities outside the ClientBundle that should still be cached cross-request. */
  nonBundleEntities: string[];
}): DataAdapters {
  const { ctx, rawData, cacheAdapter, defaultTtl, nonBundleEntities } = opts;

  const dataWithHooks = addDataHooks(ctx, rawData);

  // L2: only the long tail. Bundle entities are cached at L0 under one key.
  const cachedData = addCaching(dataWithHooks, {
    defaultTtl,
    cacheEntities: nonBundleEntities,
    cache: cacheAdapter,
  });

  // L1: dedup the full set. Cheap, useful for fall-through.
  const dedupedData = addRequestScopedDedup(cachedData, {
    dedupEntities: [...BUNDLE_ENTITIES, ...nonBundleEntities],
  });

  const purgingData = addBundleWritePurge(dedupedData, cacheAdapter);

  const bundledData = withClientBundle(ctx, purgingData, cacheAdapter);

  return addTimingLogs(ctx, bundledData);
}
