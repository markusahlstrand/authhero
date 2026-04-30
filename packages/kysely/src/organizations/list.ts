import { Kysely, sql } from "kysely";
import { Database } from "../db";
import {
  ListOrganizationsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";
import { luceneFilter } from "../helpers/filter";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<ListOrganizationsResponse> => {
    // luceneFilter widens the result-row type, so apply it first and only
    // call .selectAll() / .select(count) at execution time.
    let baseQuery = db
      .selectFrom("organizations")
      .where("tenant_id", "=", tenantId);

    // Apply search filter if q is provided. luceneFilter supports both
    // field-scoped queries (e.g. `name:control_plane`) and bare-string
    // wildcard search across name/display_name.
    if (params?.q) {
      baseQuery = luceneFilter(db, baseQuery, params.q, [
        "name",
        "display_name",
      ]);
    }

    // Apply sorting
    if (params?.sort) {
      const sortOrder = params.sort.sort_order === "asc" ? "asc" : "desc";
      const sortBy = params.sort.sort_by as
        | "name"
        | "display_name"
        | "created_at";
      if (["name", "display_name", "created_at"].includes(sortBy)) {
        baseQuery = baseQuery.orderBy(sortBy, sortOrder);
      } else {
        baseQuery = baseQuery.orderBy("created_at", "desc");
      }
    } else {
      baseQuery = baseQuery.orderBy("created_at", "desc");
    }

    // Handle checkpoint pagination (from/take)
    if (params?.from !== undefined) {
      // from is an offset index as a string
      const offset = parseInt(params.from, 10);
      if (!isNaN(offset)) {
        baseQuery = baseQuery.offset(offset);
      }
    } else if (params?.page !== undefined) {
      // Handle page-based pagination
      const perPage = params?.per_page || params?.take || 10;
      const offset = params.page * perPage;
      baseQuery = baseQuery.offset(offset);
    }

    // Apply limit (take or per_page)
    const limit = params?.take || params?.per_page || 10;
    baseQuery = baseQuery.limit(limit);

    const results = await baseQuery.selectAll().execute();

    // Get total count for include_totals
    let total = results.length;
    if (params?.include_totals) {
      let countQuery = db
        .selectFrom("organizations")
        .where("tenant_id", "=", tenantId);

      if (params?.q) {
        countQuery = luceneFilter(db, countQuery, params.q, [
          "name",
          "display_name",
        ]);
      }

      const countResult = await countQuery
        .select(sql<number>`count(*)`.as("count"))
        .executeTakeFirst();
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
