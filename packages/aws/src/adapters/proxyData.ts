import type { ProxyDataAdapter, ResolvedHost } from "@authhero/proxy";
import type {
  HandlerConfig,
  ProxyRoute,
  RouteMatch,
} from "@authhero/adapter-interfaces";
import { handlerConfigSchema, matchSchema } from "@authhero/adapter-interfaces";
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

function parseMatch(raw: string | null | undefined): RouteMatch | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const validated = matchSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
}

function parseHandlers(raw: string | null | undefined): HandlerConfig[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const result: HandlerConfig[] = [];
  for (const entry of parsed) {
    const validated = handlerConfigSchema.safeParse(entry);
    if (!validated.success) return null;
    result.push(validated.data);
  }
  return result;
}

function rowToProxyRoute(row: ProxyRouteRow): ProxyRoute | null {
  const match = parseMatch(row.match);
  const handlers = parseHandlers(row.handlers);
  if (match === null || handlers === null) return null;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    custom_domain_id: row.custom_domain_id,
    priority: row.priority,
    match,
    handlers,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function resolveHostFromDynamo(
  ctx: DynamoDBContext,
  host: string,
): Promise<ResolvedHost | null> {
  // Strip an optional :port and trailing dot before lowercasing so values like
  // "Example.com:443" or "example.com." hit the GSI's canonical entry.
  const portIdx = host.indexOf(":");
  const hostWithoutPort = portIdx === -1 ? host : host.slice(0, portIdx);
  const hostWithoutTrailingDot = hostWithoutPort.endsWith(".")
    ? hostWithoutPort.slice(0, -1)
    : hostWithoutPort;
  const normalizedHost = hostWithoutTrailingDot.toLowerCase();
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
    .filter((route): route is ProxyRoute => route !== null)
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

export function createProxyDataAdapter(ctx: DynamoDBContext): ProxyDataAdapter {
  return {
    proxyRoutes: createProxyRoutesAdapter(ctx),
    resolveHost: (host) => resolveHostFromDynamo(ctx, host),
  };
}
