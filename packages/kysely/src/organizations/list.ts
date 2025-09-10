import { Kysely } from "kysely";
import { Database } from "../db";
import {
  ListOrganizationsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<ListOrganizationsResponse> => {
    let query = db
      .selectFrom("organizations")
      .selectAll()
      .where("tenant_id", "=", tenantId)
      .orderBy("created_at", "desc");

    if (params?.per_page) {
      query = query.limit(params.per_page);
    }

    if (params?.page) {
      const offset = (params.page - 1) * (params.per_page || 10);
      query = query.offset(offset);
    }

    const results = await query.execute();

    const organizations = results.map((result) =>
      removeNullProperties({
        ...result,
        branding: result.branding ? JSON.parse(result.branding) : {},
        metadata: result.metadata ? JSON.parse(result.metadata) : {},
        enabled_connections: result.enabled_connections
          ? JSON.parse(result.enabled_connections)
          : [],
        token_quota: result.token_quota ? JSON.parse(result.token_quota) : {},
      }),
    );

    return {
      organizations,
      start: params?.page ? (params.page - 1) * (params.per_page || 10) : 0,
      limit: params?.per_page || organizations.length,
      length: organizations.length,
    };
  };
}
