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

interface ClientGrantListParams extends ListParams {
  audience?: string;
  client_id?: string;
}

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ClientGrantListParams = {},
  ): Promise<ListClientGrantsResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q, audience, client_id } = params;

    let query = db
      .selectFrom("client_grants")
      .where("client_grants.tenant_id", "=", tenantId);

    // Handle direct parameter filtering
    if (audience) {
      query = query.where("client_grants.audience", "=", audience);
    }
    if (client_id) {
      query = query.where("client_grants.client_id", "=", client_id);
    }

    if (q) {
      const trimmedQ = q.trim();
      const parts = trimmedQ.split(/\s+/);
      const one = parts.length === 1 ? parts[0] : undefined;
      const match = one ? one.match(/^(-)?(client_id|audience):(.*)$/) : null;
      const value = match ? match[3] : "";
      const hasRangeOp = /^(>=|>|<=|<)/.test(value || "");
      if (match && !hasRangeOp && value) {
        const neg = !!match[1];
        const field =
          match[2] === "client_id"
            ? "client_grants.client_id"
            : "client_grants.audience";
        if (neg) {
          query = query.where(field, "!=", value);
        } else {
          query = query.where(field, "=", value);
        }
      } else {
        query = luceneFilter(db, query, trimmedQ, [
          "client_grants.client_id",
          "client_grants.audience",
        ]);
      }
    }

    const filteredQuery = query
      .orderBy("client_grants.created_at", "desc")
      .limit(per_page)
      .offset(page * per_page);

    const results = await filteredQuery.selectAll().execute();

    const clientGrants: ClientGrant[] = results.map((result) => {
      const clientGrant: ClientGrant = {
        id: result.id,
        client_id: result.client_id,
        audience: result.audience,
        scope: result.scope ? JSON.parse(result.scope) : [],
        organization_usage: result.organization_usage as "deny" | "allow" | "require" | undefined,
        // Convert integers back to booleans for API response (with defaults)
        allow_any_organization: result.allow_any_organization !== undefined 
          ? Boolean(result.allow_any_organization) 
          : false,
        is_system: result.is_system !== undefined 
          ? Boolean(result.is_system) 
          : false,
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
