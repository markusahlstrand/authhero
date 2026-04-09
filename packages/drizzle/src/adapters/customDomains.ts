import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { CustomDomain } from "@authhero/adapter-interfaces";
import { customDomains } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

function sqlToCustomDomain(row: any): CustomDomain {
  const { tenant_id: _, domain_metadata, ...rest } = row;
  return removeNullProperties({
    ...rest,
    primary: !!rest.primary,
    domain_metadata: parseJsonIfString(domain_metadata),
  });
}

export function createCustomDomainsAdapter(
  db: DrizzleDb,
) {
  return {
    async create(tenant_id: string, params: any): Promise<CustomDomain> {
      const now = new Date().toISOString();
      const custom_domain_id = params.custom_domain_id || nanoid();

      const values = {
        custom_domain_id,
        tenant_id,
        domain: params.domain,
        primary: params.primary ?? false,
        status: params.status || "pending",
        type: params.type,
        origin_domain_name: params.origin_domain_name,
        verification: params.verification,
        custom_client_ip_header: params.custom_client_ip_header,
        tls_policy: params.tls_policy,
        domain_metadata: params.domain_metadata
          ? JSON.stringify(params.domain_metadata)
          : undefined,
        created_at: now,
        updated_at: now,
      };

      await db.insert(customDomains).values(values);

      return sqlToCustomDomain({ ...values, tenant_id });
    },

    async get(
      tenant_id: string,
      custom_domain_id: string,
    ): Promise<CustomDomain | null> {
      const result = await db
        .select()
        .from(customDomains)
        .where(
          and(
            eq(customDomains.tenant_id, tenant_id),
            eq(customDomains.custom_domain_id, custom_domain_id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToCustomDomain(result);
    },

    async getByDomain(domain: string) {
      const result = await db
        .select()
        .from(customDomains)
        .where(eq(customDomains.domain, domain))
        .get();

      if (!result) return null;

      return {
        ...sqlToCustomDomain(result),
        tenant_id: result.tenant_id,
      };
    },

    async list(tenant_id: string): Promise<CustomDomain[]> {
      const results = await db
        .select()
        .from(customDomains)
        .where(eq(customDomains.tenant_id, tenant_id))
        .all();

      return results.map(sqlToCustomDomain);
    },

    async update(
      tenant_id: string,
      custom_domain_id: string,
      params: Partial<CustomDomain>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.domain !== undefined) updateData.domain = params.domain;
      if (params.primary !== undefined) updateData.primary = params.primary;
      if (params.status !== undefined) updateData.status = params.status;
      if (params.type !== undefined) updateData.type = params.type;
      if (params.origin_domain_name !== undefined)
        updateData.origin_domain_name = params.origin_domain_name;
      if (params.verification !== undefined)
        updateData.verification = params.verification;
      if (params.custom_client_ip_header !== undefined)
        updateData.custom_client_ip_header = params.custom_client_ip_header;
      if (params.tls_policy !== undefined)
        updateData.tls_policy = params.tls_policy;
      if (params.domain_metadata !== undefined)
        updateData.domain_metadata = JSON.stringify(params.domain_metadata);

      const results = await db
        .update(customDomains)
        .set(updateData)
        .where(
          and(
            eq(customDomains.tenant_id, tenant_id),
            eq(customDomains.custom_domain_id, custom_domain_id),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async remove(
      tenant_id: string,
      custom_domain_id: string,
    ): Promise<boolean> {
      const results = await db
        .delete(customDomains)
        .where(
          and(
            eq(customDomains.tenant_id, tenant_id),
            eq(customDomains.custom_domain_id, custom_domain_id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
