import { Kysely, Selectable } from "kysely";
import {
  ListParams,
  ListClientGrantsResponse,
  ClientGrant,
  clientGrantSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";

// SQL rows store scope/authorization_details_types as JSON strings and booleans
// as integers, and leave unset enum columns (organization_usage, subject_type)
// as NULL. Stripping nulls turns those into absent optionals and
// clientGrantSchema.parse then validates the enums and drops tenant_id — so no
// casts are needed and only the JSON/boolean fields are prepared by hand.
function sqlToClientGrant(
  row: Selectable<Database["client_grants"]>,
): ClientGrant {
  return clientGrantSchema.parse(
    removeNullProperties({
      ...row,
      scope: row.scope ? JSON.parse(row.scope) : [],
      allow_any_organization: Boolean(row.allow_any_organization),
      is_system: Boolean(row.is_system),
      authorization_details_types: row.authorization_details_types
        ? JSON.parse(row.authorization_details_types)
        : [],
    }),
  );
}

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListClientGrantsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q, sort } = params;

    let query = db
      .selectFrom("client_grants")
      .where("client_grants.tenant_id", "=", tenantId);

    if (q) {
      const trimmedQ = q.trim();
      const parts = trimmedQ.split(/\s+/);
      const one = parts.length === 1 ? parts[0] : undefined;
      // Handle both quoted and unquoted values: field:"value" or field:value
      const match = one
        ? one.match(/^(-)?([a-zA-Z_][a-zA-Z0-9_]*):"?([^"]*)"?$/)
        : null;
      const value = match ? match[3] : "";
      const hasRangeOp = /^(>=|>|<=|<)/.test(value || "");
      if (match && !hasRangeOp && value) {
        const neg = !!match[1];
        const fieldName = match[2];
        const { ref } = db.dynamic;
        const columnRef = ref(`client_grants.${fieldName}`);

        // Special handling for boolean fields that are stored as integers
        if (fieldName === "allow_any_organization") {
          const boolValue = value === "true" ? 1 : 0;
          query = query.where(columnRef, neg ? "!=" : "=", boolValue);
        } else {
          query = query.where(columnRef, neg ? "!=" : "=", value);
        }
      } else {
        query = luceneFilter(db, query, trimmedQ, []);
      }
    }

    // Keyset (checkpoint) pagination: from/take. Fixed created_at desc order
    // with id tiebreaker; no total, matching Auth0's checkpoint responses.
    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(
        query.selectAll(),
        params,
        { sortColumn: "created_at", sortOrder: "desc" },
      );
      const client_grants = rows.map(sqlToClientGrant);
      return { client_grants, start: 0, limit, length: client_grants.length, next };
    }

    // Offset pagination.
    let filteredQuery = query;
    if (sort) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    } else {
      filteredQuery = filteredQuery.orderBy("client_grants.created_at", "desc");
    }

    const results = await filteredQuery
      .selectAll()
      .limit(per_page)
      .offset(page * per_page)
      .execute();
    const client_grants = results.map(sqlToClientGrant);

    if (!include_totals) {
      return { client_grants, start: 0, limit: 0, length: 0 };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      client_grants,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
