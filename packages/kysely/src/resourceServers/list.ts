import { Kysely } from "kysely";
import {
  ListParams,
  ListResourceServersResponse,
  ResourceServer,
} from "@authhero/adapter-interfaces";
import { Database, sqlResourceServerSchema } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import { z } from "@hono/zod-openapi";

type ResourceServerDbRow = z.infer<typeof sqlResourceServerSchema>;

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = { page: 0, per_page: 50, include_totals: false },
  ): Promise<ListResourceServersResponse> => {
    let query = db
      .selectFrom("resource_servers")
      .where("resource_servers.tenant_id", "=", tenantId);

    if (params.q) {
      const q = params.q.trim();
      const parts = q.split(/\s+/);
      const one = parts.length === 1 ? parts[0] : undefined;
      const match = one ? one.match(/^(-)?(name|identifier):(.*)$/) : null;
      const value = match ? match[3] : "";
      const hasRangeOp = /^(>=|>|<=|<)/.test(value || "");
      if (match && !hasRangeOp) {
        const neg = !!match[1];
        const field =
          match[2] === "name"
            ? "resource_servers.name"
            : "resource_servers.identifier";
        query = neg
          ? query.where(field, "not like", `%${value}%`)
          : query.where(field, "like", `%${value}%`);
      } else {
        query = luceneFilter(db, query, q, [
          "resource_servers.name",
          "resource_servers.identifier",
        ]);
      }
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const rows = await filteredQuery.selectAll().execute();
    const resource_servers: ResourceServer[] = rows.map((row) => {
      const dbRow = row as ResourceServerDbRow;
      const {
        verification_key,
        scopes,
        options,
        skip_consent_for_verifiable_first_party_clients,
        allow_offline_access,
        ...rest
      } = dbRow;

      const resourceServer = {
        ...rest,
        scopes: scopes ? JSON.parse(scopes) : [],
        options: options ? JSON.parse(options) : {},
        skip_consent_for_verifiable_first_party_clients:
          !!skip_consent_for_verifiable_first_party_clients,
        allow_offline_access: !!allow_offline_access,
        // Convert verification_key back to verificationKey for API
        verificationKey: verification_key,
      };

      return removeNullProperties(resourceServer);
    });

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      resource_servers,
      start: params.page * params.per_page,
      limit: params.per_page,
      length: getCountAsInt(count),
    };
  };
}
