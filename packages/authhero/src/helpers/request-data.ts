import { Context } from "hono";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";

/**
 * Installs `data` as this request's adapter stack on `ctx.var.data`.
 *
 * Also writes it to `ctx.env.data`, a deprecated alias kept for readers that
 * have not moved to `ctx.var.data` yet, including consumers outside this repo.
 * The env write is only safe because `applyConfigMiddleware` gives every
 * request its own shallow copy of `env`. Drop it in the next major (#140).
 */
export function setRequestData(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): void {
  ctx.set("data", data);
  ctx.env.data = data;
}

/**
 * The raw adapter a route group composes its per-request stack on: the base
 * an earlier middleware installed on `ctx.var.baseData` (per-tenant database
 * isolation), or `fallback`, the startup adapter from the config.
 */
export function getBaseData(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  fallback: DataAdapters,
): DataAdapters {
  return ctx.var.baseData ?? fallback;
}
