import { and, asc, eq } from "drizzle-orm";
import type { ResolvedHost } from "@authhero/proxy";
import type {
  HandlerConfig,
  ProxyRoute,
  RouteMatch,
} from "@authhero/adapter-interfaces";
import {
  handlerConfigSchema,
  matchSchema,
} from "@authhero/adapter-interfaces";
import { customDomains, proxyRoutes as proxyRoutesTable } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

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

export async function resolveHostFromDrizzle(
  db: DrizzleDb,
  host: string,
): Promise<ResolvedHost | null> {
  const normalizedHost = host.toLowerCase();

  const domainRows = await db
    .select({
      custom_domain_id: customDomains.custom_domain_id,
      tenant_id: customDomains.tenant_id,
      domain: customDomains.domain,
    })
    .from(customDomains)
    .where(eq(customDomains.domain, normalizedHost))
    .limit(1);
  const domainRow = domainRows[0];
  if (!domainRow) return null;

  const routeRows = await db
    .select()
    .from(proxyRoutesTable)
    .where(
      and(
        eq(proxyRoutesTable.tenant_id, domainRow.tenant_id),
        eq(proxyRoutesTable.custom_domain_id, domainRow.custom_domain_id),
      ),
    )
    .orderBy(asc(proxyRoutesTable.priority), asc(proxyRoutesTable.created_at));

  const routes: ProxyRoute[] = routeRows.map((row) => ({
    id: row.id,
    tenant_id: row.tenant_id,
    custom_domain_id: row.custom_domain_id,
    priority: row.priority,
    match: parseMatch(row.match),
    handlers: parseHandlers(row.handlers),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return {
    tenant_id: domainRow.tenant_id,
    custom_domain_id: domainRow.custom_domain_id,
    domain: domainRow.domain,
    routes,
  };
}
