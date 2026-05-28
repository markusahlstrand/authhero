import type { ProxyDataAdapter, ResolvedHost } from "@authhero/proxy";
import type {
  HandlerConfig,
  ProxyRoute,
  RouteMatch,
} from "@authhero/adapter-interfaces";
import {
  handlerConfigSchema,
  matchSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext } from "../types";
import { customDomainKeys, proxyRouteKeys } from "../keys";
import { queryItems } from "../utils";
import { createProxyRoutesAdapter } from "./proxyRoutes";

interface CustomDomainGsiItem {
  tenant_id: string;
  custom_domain_id: string;
  domain: string;
}

interface ProxyRouteRow {
  id: string;
  tenant_id: string;
  custom_domain_id: string;
  priority: number;
  match: string;
  handlers: string;
  created_at: string;
  updated_at: string;
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

function rowToProxyRoute(row: ProxyRouteRow): ProxyRoute {
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

async function resolveHostFromDynamo(
  ctx: DynamoDBContext,
  host: string,
): Promise<ResolvedHost | null> {
  const normalizedHost = host.toLowerCase();
  const { items: domainItems } = await queryItems<CustomDomainGsiItem>(
    ctx,
    customDomainKeys.gsi1pk(normalizedHost),
    { indexName: "GSI1", skValue: customDomainKeys.gsi1sk() },
  );
  const domain = domainItems[0];
  if (!domain) return null;

  const { items: routeItems } = await queryItems<ProxyRouteRow>(
    ctx,
    proxyRouteKeys.gsi1pk(domain.tenant_id, domain.custom_domain_id),
    { indexName: "GSI1" },
  );

  const routes = routeItems
    .map(rowToProxyRoute)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.created_at.localeCompare(b.created_at);
    });

  return {
    tenant_id: domain.tenant_id,
    custom_domain_id: domain.custom_domain_id,
    domain: domain.domain,
    routes,
  };
}

export function createProxyDataAdapter(
  ctx: DynamoDBContext,
): ProxyDataAdapter {
  return {
    proxyRoutes: createProxyRoutesAdapter(ctx),
    resolveHost: (host) => resolveHostFromDynamo(ctx, host),
  };
}
