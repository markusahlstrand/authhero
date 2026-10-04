import type { DataAdapters } from "authhero";

/**
 * The request's adapter stack. Behind authhero (or the database isolation
 * middleware) that is `ctx.var.data`; a router mounted standalone, outside
 * authhero, only has the `data` binding on `ctx.env`.
 */
export function getRequestData(ctx: {
  var: { data?: DataAdapters };
  env: { data: DataAdapters };
}): DataAdapters {
  return ctx.var.data ?? ctx.env.data;
}
