import { Kysely } from "kysely";
import type { ResolvedHost } from "@authhero/proxy";
import { Database } from "../db";
import { rowToProxyRoute } from "./serialize";

export async function resolveHostFromKysely(
  db: Kysely<Database>,
  host: string,
): Promise<ResolvedHost | null> {
  // Hostnames are case-insensitive (RFC 4343). Strip an optional port and a
  // trailing dot before lowercasing so callers that pass e.g.
  // "Example.com:443" or "example.com." match the stored canonical form.
  const portIdx = host.indexOf(":");
  const hostWithoutPort = portIdx === -1 ? host : host.slice(0, portIdx);
  const hostWithoutTrailingDot = hostWithoutPort.endsWith(".")
    ? hostWithoutPort.slice(0, -1)
    : hostWithoutPort;
  const normalizedHost = hostWithoutTrailingDot.toLowerCase();
  const domainRow = await db
    .selectFrom("custom_domains")
    .where("domain", "=", normalizedHost)
    .select(["custom_domain_id", "tenant_id", "domain"])
    .executeTakeFirst();

  if (!domainRow) return null;

  const routeRows = await db
    .selectFrom("proxy_routes")
    .where("tenant_id", "=", domainRow.tenant_id)
    .where("custom_domain_id", "=", domainRow.custom_domain_id)
    .selectAll()
    .orderBy("priority", "asc")
    .orderBy("created_at", "asc")
    .execute();

  return {
    tenant_id: domainRow.tenant_id,
    custom_domain_id: domainRow.custom_domain_id,
    domain: domainRow.domain,
    routes: routeRows.map(rowToProxyRoute),
  };
}
