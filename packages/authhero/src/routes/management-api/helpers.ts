import { HTTPException } from "hono/http-exception";
import { z } from "@hono/zod-openapi";
import { totalsSchema } from "@authhero/adapter-interfaces";

/**
 * Returns the tenant id resolved by tenantMiddleware, or throws the
 * management API's standard 400 when the request carries no tenant (no
 * `tenant-id` header, no tenant subdomain/custom domain, and no
 * single-tenant fallback).
 *
 * Structurally typed on purpose: handler contexts are narrowed per-route by
 * `defineRoute`, so accepting the full hono `Context` generic here would
 * force every call site to line up generics for a helper that only reads
 * one variable.
 */
export function requireTenantId(ctx: { var: { tenant_id?: string } }): string {
  const tenantId = ctx.var.tenant_id;
  if (!tenantId) {
    throw new HTTPException(400, {
      message: "tenant-id header is required",
    });
  }
  return tenantId;
}

/**
 * Schema factory for the `include_totals` list-response shape:
 * `{ start, limit, length, total?, next?, <resource>: [...] }`.
 *
 * `withTotals({ roles: z.array(roleSchema) })` replaces the
 * `totalsSchema.extend({ roles: z.array(roleSchema) })` pattern repeated
 * across the management-api modules.
 */
export function withTotals<T extends z.ZodRawShape>(items: T) {
  return totalsSchema.extend(items);
}

/**
 * Picks the list-response body for the `include_totals` branch every list
 * handler repeats: the full totals envelope when `include_totals` is set,
 * otherwise the bare item array under `key`.
 *
 * The caller keeps its own `ctx.json(...)` so hono's per-route response
 * typing still applies.
 */
export function listResponse<T extends object, K extends keyof T>(
  include_totals: boolean | undefined,
  result: T,
  key: K,
): T | T[K] {
  return include_totals ? result : result[key];
}
