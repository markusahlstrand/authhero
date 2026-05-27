import { ProxyRoute, MiddlewareConfig, middlewareConfigSchema } from "../types";
import { ProxyRouteRow } from "./schema";

export function rowToProxyRoute(row: ProxyRouteRow): ProxyRoute {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    custom_domain_id: row.custom_domain_id,
    priority: row.priority,
    path_pattern: row.path_pattern,
    upstream_type: row.upstream_type,
    upstream_url: row.upstream_url,
    preserve_host: row.preserve_host !== 0,
    middleware: parseMiddleware(row.middleware),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function parseMiddleware(raw: string | null | undefined): MiddlewareConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: MiddlewareConfig[] = [];
    for (const entry of parsed) {
      const validated = middlewareConfigSchema.safeParse(entry);
      if (validated.success) result.push(validated.data);
    }
    return result;
  } catch {
    return [];
  }
}
