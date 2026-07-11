import { Kysely } from "kysely";
import { Database } from "../db";
import {
  UserOrganization,
  Totals,
  ListParams,
} from "@authhero/adapter-interfaces";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<{ userOrganizations: UserOrganization[] } & Totals> => {
    let query = db
      .selectFrom("user_organizations")
      .selectAll()
      .where("tenant_id", "=", tenantId);

    // Support filtering by user_id or organization_id using the q parameter
    if (params?.q) {
      // Check if the query is for a specific user or organization
      if (params.q.startsWith("user_id:")) {
        const userId = params.q.replace("user_id:", "");
        query = query.where("user_id", "=", userId);
      } else if (params.q.startsWith("organization_id:")) {
        const organizationId = params.q.replace("organization_id:", "");
        query = query.where("organization_id", "=", organizationId);
      }
    }

    const mapRow = (result: {
      id: string;
      user_id: string;
      organization_id: string;
      created_at: string;
      updated_at: string;
    }): UserOrganization => ({
      id: result.id,
      user_id: result.user_id,
      organization_id: result.organization_id,
      created_at: result.created_at,
      updated_at: result.updated_at,
    });

    // Keyset (checkpoint) pagination: from/take. No total is computed, matching
    // Auth0's checkpoint responses.
    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(query, params, {
        sortColumn: "created_at",
        sortOrder: "desc",
      });
      return {
        userOrganizations: rows.map(mapRow),
        start: 0,
        limit,
        length: rows.length,
        next,
      };
    }

    // Offset pagination (page/per_page) with a total count.
    const page = params?.page || 0;
    const per_page = params?.per_page || 50;
    const offset = page * per_page;

    const results = await query
      .orderBy("created_at", "desc")
      .limit(per_page)
      .offset(offset)
      .execute();

    let countQuery = db
      .selectFrom("user_organizations")
      .select(db.fn.count("id").as("count"))
      .where("tenant_id", "=", tenantId);

    if (params?.q) {
      if (params.q.startsWith("user_id:")) {
        const userId = params.q.replace("user_id:", "");
        countQuery = countQuery.where("user_id", "=", userId);
      } else if (params.q.startsWith("organization_id:")) {
        const organizationId = params.q.replace("organization_id:", "");
        countQuery = countQuery.where("organization_id", "=", organizationId);
      }
    }

    const total = await countQuery.executeTakeFirst();

    return {
      userOrganizations: results.map(mapRow),
      start: offset,
      limit: per_page,
      length: Number(total?.count || 0),
    };
  };
}
