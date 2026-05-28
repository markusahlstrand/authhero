import {
  HandlerConfig,
  ProxyRoute,
  RouteMatch,
  handlerConfigSchema,
  matchSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export type ProxyRouteRow = Database["proxy_routes"];

export function rowToProxyRoute(row: ProxyRouteRow): ProxyRoute {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    custom_domain_id: row.custom_domain_id,
    priority: row.priority,
    match: parseMatch(row.match),
    handlers: parseHandlers(row.handlers),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseMatch(raw: string | null | undefined): RouteMatch {
  if (!raw) return { path: "/*" };
  try {
    const parsed: unknown = JSON.parse(raw);
    const validated = matchSchema.safeParse(parsed);
    if (validated.success) return validated.data;
  } catch {
    /* fall through */
  }
  return { path: "/*" };
}

function parseHandlers(raw: string | null | undefined): HandlerConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: HandlerConfig[] = [];
    for (const entry of parsed) {
      const validated = handlerConfigSchema.safeParse(entry);
      if (validated.success) result.push(validated.data);
    }
    return result;
  } catch {
    return [];
  }
}
