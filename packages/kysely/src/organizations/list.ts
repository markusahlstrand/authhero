import { Kysely, sql } from "kysely";
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
      .where("tenant_id", "=", tenantId);

    // Apply search filter if q is provided
    if (params?.q) {
      query = query.where((eb) =>
        eb.or([
          eb("name", "like", `%${params.q}%`),
          eb("display_name", "like", `%${params.q}%`),
        ]),
      );
    }

    // Apply sorting
    if (params?.sort) {
      const sortOrder = params.sort.sort_order === "asc" ? "asc" : "desc";
      const sortBy = params.sort.sort_by as
        | "name"
        | "display_name"
        | "created_at";
      if (["name", "display_name", "created_at"].includes(sortBy)) {
        query = query.orderBy(sortBy, sortOrder);
      } else {
        query = query.orderBy("created_at", "desc");
      }
    } else {
      query = query.orderBy("created_at", "desc");
    }

    // Handle checkpoint pagination (from/take)
    if (params?.from !== undefined) {
      // from is an offset index as a string
      const offset = parseInt(params.from, 10);
      if (!isNaN(offset)) {
        query = query.offset(offset);
      }
    } else if (params?.page !== undefined) {
      // Handle page-based pagination
      const perPage = params?.per_page || params?.take || 10;
      const offset = params.page * perPage;
      query = query.offset(offset);
    }

    // Apply limit (take or per_page)
    const limit = params?.take || params?.per_page || 10;
    query = query.limit(limit);

    const results = await query.execute();

    // Get total count for include_totals
    let total = results.length;
    if (params?.include_totals) {
      let countQuery = db
        .selectFrom("organizations")
        .select(sql<number>`count(*)`.as("count"))
        .where("tenant_id", "=", tenantId);

      if (params?.q) {
        countQuery = countQuery.where((eb) =>
          eb.or([
            eb("name", "like", `%${params.q}%`),
            eb("display_name", "like", `%${params.q}%`),
          ]),
        );
      }

      const countResult = await countQuery.executeTakeFirst();
      total = Number(countResult?.count || 0);
    }

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

    const perPage = params?.take || params?.per_page || 10;
    const start = params?.from
      ? parseInt(params.from, 10)
      : params?.page
        ? params.page * perPage
        : 0;

    return {
      organizations,
      start: isNaN(start) ? 0 : start,
      limit: perPage,
      length: organizations.length,
      total,
    };
  };
}
