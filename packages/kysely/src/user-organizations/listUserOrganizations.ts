import { Kysely } from "kysely";
import { Database } from "../db";
import { Organization, Totals, ListParams } from "@authhero/adapter-interfaces";

export function listUserOrganizations(db: Kysely<Database>) {
  return async (
    tenantId: string,
    userId: string,
    params?: ListParams,
  ): Promise<{ organizations: Organization[] } & Totals> => {
    const page = params?.page || 0;
    const per_page = params?.per_page || 50;
    const offset = page * per_page;

    // Join user_organizations with organizations to get full organization details
    let query = db
      .selectFrom("user_organizations")
      .innerJoin(
        "organizations",
        "organizations.id",
        "user_organizations.organization_id",
      )
      .select([
        "organizations.id",
        "organizations.name",
        "organizations.display_name",
        "organizations.branding",
        "organizations.metadata",
        "organizations.enabled_connections",
        "organizations.token_quota",
        "organizations.created_at",
        "organizations.updated_at",
        "user_organizations.created_at as joined_at",
      ])
      .where("user_organizations.tenant_id", "=", tenantId)
      .where("user_organizations.user_id", "=", userId);

    query = query.orderBy("user_organizations.created_at", "desc");

    if (per_page > 0) {
      query = query.limit(per_page).offset(offset);
    }

    const results = await query.execute();

    // Get total count
    const countResult = await db
      .selectFrom("user_organizations")
      .innerJoin(
        "organizations",
        "organizations.id",
        "user_organizations.organization_id",
      )
      .select(db.fn.count("user_organizations.id").as("count"))
      .where("user_organizations.tenant_id", "=", tenantId)
      .where("user_organizations.user_id", "=", userId)
      .executeTakeFirst();

    const organizations: Organization[] = results.map((result) => ({
      id: result.id,
      name: result.name,
      display_name: result.display_name,
      branding: result.branding ? JSON.parse(result.branding) : undefined,
      metadata: result.metadata ? JSON.parse(result.metadata) : {},
      enabled_connections: result.enabled_connections
        ? JSON.parse(result.enabled_connections)
        : [],
      token_quota: result.token_quota
        ? JSON.parse(result.token_quota)
        : undefined,
      created_at: result.created_at,
      updated_at: result.updated_at,
      // Add membership info
      joined_at: result.joined_at,
    }));

    return {
      organizations,
      start: offset,
      limit: per_page,
      length: Number(countResult?.count || 0),
    };
  };
}
