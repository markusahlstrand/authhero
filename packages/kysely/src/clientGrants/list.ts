import { Kysely } from "kysely";
import {
  ListParams,
  ListClientGrantsResponse,
  ClientGrant,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";

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
      const match = one ? one.match(/^(-)?([a-zA-Z_][a-zA-Z0-9_]*):"?([^"]*)"?$/) : null;
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
          if (neg) {
            query = query.where(columnRef, "!=", boolValue);
          } else {
            query = query.where(columnRef, "=", boolValue);
          }
        } else {
          // Generic handling for string fields
          if (neg) {
            query = query.where(columnRef, "!=", value);
          } else {
            query = query.where(columnRef, "=", value);
          }
        }
      } else {
        query = luceneFilter(db, query, trimmedQ, []);
      }
    }

    let filteredQuery = query;

    // Add sorting if specified
    if (sort) {
      const { ref } = db.dynamic;
      filteredQuery = filteredQuery.orderBy(ref(sort.sort_by), sort.sort_order);
    } else {
      filteredQuery = filteredQuery.orderBy("client_grants.created_at", "desc");
    }

    filteredQuery = filteredQuery.limit(per_page).offset(page * per_page);

    const results = await filteredQuery.selectAll().execute();

    const clientGrants: ClientGrant[] = results.map((result) => {
      const clientGrant: ClientGrant = {
        id: result.id,
        client_id: result.client_id,
        audience: result.audience,
        scope: result.scope ? JSON.parse(result.scope) : [],
        organization_usage: result.organization_usage as
          | "deny"
          | "allow"
          | "require"
          | undefined,
        // Convert integers back to booleans for API response (with defaults)
        allow_any_organization:
          result.allow_any_organization !== undefined
            ? Boolean(result.allow_any_organization)
            : false,
        is_system:
          result.is_system !== undefined ? Boolean(result.is_system) : false,
        subject_type: result.subject_type as "client" | "user" | undefined,
        authorization_details_types: result.authorization_details_types
          ? JSON.parse(result.authorization_details_types)
          : [],
        created_at: result.created_at,
        updated_at: result.updated_at,
      };

      return removeNullProperties(clientGrant);
    });

    if (!include_totals) {
      return {
        client_grants: clientGrants,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      client_grants: clientGrants,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
