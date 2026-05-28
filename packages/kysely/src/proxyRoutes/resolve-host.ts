import { Kysely } from "kysely";
import type { ResolvedHost } from "@authhero/proxy";
import { Database } from "../db";
import { rowToProxyRoute } from "./serialize";

export async function resolveHostFromKysely(
  db: Kysely<Database>,
  host: string,
): Promise<ResolvedHost | null> {
  // Hostnames are case-insensitive (RFC 4343), so normalize before lookup.
  const normalizedHost = host.toLowerCase();
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
