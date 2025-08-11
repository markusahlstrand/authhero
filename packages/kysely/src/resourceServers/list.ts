import { Kysely } from "kysely";
import {
  ListParams,
  ListResourceServersResponse,
  ResourceServer,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = { page: 0, per_page: 50, include_totals: false },
  ): Promise<ListResourceServersResponse> => {
    let query = db
      .selectFrom("resource_servers")
      .where("resource_servers.tenant_id", "=", tenantId);

    if (params.q) {
      query = luceneFilter(db, query, params.q, ["name", "identifier"]);
    }

    const filteredQuery = query
      .offset(params.page * params.per_page)
      .limit(params.per_page);

    const rows = await filteredQuery.selectAll().execute();
    const resource_servers: ResourceServer[] = rows.map((row: any) => ({
      ...row,
      scopes: row.scopes ? JSON.parse(row.scopes) : [],
      options: row.options ? JSON.parse(row.options) : {},
      skip_consent_for_verifiable_first_party_clients:
        !!row.skip_consent_for_verifiable_first_party_clients,
      allow_offline_access: !!row.allow_offline_access,
    }));

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
