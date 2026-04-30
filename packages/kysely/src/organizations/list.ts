import { Kysely, sql } from "kysely";
import { Database } from "../db";
import {
  ListOrganizationsResponse,
  ListParams,
} from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";
import { luceneFilter, sanitizeLuceneQuery } from "../helpers/filter";

const ALLOWED_Q_FIELDS = ["name", "display_name"];

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

    // Apply search filter if q is provided. Sanitize first so only
    // whitelisted fields reach luceneFilter; otherwise a clause like
    // `q=created_at:2020` would emit SQL against arbitrary columns.
    if (params?.q) {
      const sanitized = sanitizeLuceneQuery(params.q, ALLOWED_Q_FIELDS);
      if (sanitized) {
        baseQuery = luceneFilter(db, baseQuery, sanitized, ALLOWED_Q_FIELDS);
      }
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

    // Clamp pagination inputs so negative or non-finite values cannot
    // produce bad SQL. take wins over per_page when both are supplied.
    const rawPerPage = params?.take ?? params?.per_page;
    const perPage =
      typeof rawPerPage === "number" && Number.isFinite(rawPerPage) && rawPerPage > 0
        ? Math.floor(rawPerPage)
        : 10;

    let offset = 0;
    if (params?.from !== undefined) {
      const parsed = parseInt(params.from, 10);
      if (!Number.isNaN(parsed)) {
        offset = Math.max(0, parsed);
      }
    } else if (
      typeof params?.page === "number" &&
      Number.isFinite(params.page)
    ) {
      offset = Math.max(0, Math.floor(params.page) * perPage);
    }

    if (offset > 0) {
      baseQuery = baseQuery.offset(offset);
    }
    baseQuery = baseQuery.limit(perPage);

    const results = await baseQuery.selectAll().execute();

    // Get total count for include_totals
    let total = results.length;
    if (params?.include_totals) {
      let countQuery = db
        .selectFrom("organizations")
        .where("tenant_id", "=", tenantId);

      if (params?.q) {
        const sanitized = sanitizeLuceneQuery(params.q, ALLOWED_Q_FIELDS);
        if (sanitized) {
          countQuery = luceneFilter(
            db,
            countQuery,
            sanitized,
            ALLOWED_Q_FIELDS,
          );
        }
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

    return {
      organizations,
      start: offset,
      limit: perPage,
      length: organizations.length,
      total,
    };
  };
}
