import { Kysely } from "kysely";
import {
  ListParams,
  ListResourceServersResponse,
  ResourceServer,
} from "@authhero/adapter-interfaces";
import { unquoteLuceneValue } from "@authhero/adapter-interfaces";
import { Database, sqlResourceServerSchema } from "../db";
import getCountAsInt from "../utils/getCountAsInt";
import { luceneFilter } from "../helpers/filter";
import { removeNullProperties } from "../helpers/remove-nulls";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";
import { z } from "@hono/zod-openapi";

type ResourceServerDbRow = z.infer<typeof sqlResourceServerSchema>;

function transformResourceServer(row: ResourceServerDbRow): ResourceServer {
  const {
    verification_key,
    scopes,
    options,
    skip_consent_for_verifiable_first_party_clients,
    allow_offline_access,
    is_system,
    metadata,
    ...rest
  } = row;

  const resourceServer: ResourceServer = removeNullProperties({
    ...rest,
    scopes: scopes ? JSON.parse(scopes) : [],
    options: options ? JSON.parse(options) : {},
    skip_consent_for_verifiable_first_party_clients:
      !!skip_consent_for_verifiable_first_party_clients,
    allow_offline_access: !!allow_offline_access,
    is_system: is_system ? true : undefined,
    metadata: metadata ? JSON.parse(metadata) : undefined,
    // Convert verification_key back to verificationKey for API
    verificationKey: verification_key,
  });

  resourceServer.token_lifetime ??= 86400;
  resourceServer.token_lifetime_for_web ??= 7200;

  return resourceServer;
}

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params: ListParams = {},
  ): Promise<ListResourceServersResponse> => {
    const { page = 0, per_page = 50, include_totals = false, q } = params;

    let query = db
      .selectFrom("resource_servers")
      .where("resource_servers.tenant_id", "=", tenantId);

    if (q) {
      const trimmedQ = q.trim();
      const parts = trimmedQ.split(/\s+/);
      const one = parts.length === 1 ? parts[0] : undefined;
      const match = one ? one.match(/^(-)?(name|identifier):(.*)$/) : null;
      // Strip escapeLuceneValue quoting so a quoted operand compares as its
      // unquoted self, mirroring the clients/user-organizations lists.
      const value = match ? unquoteLuceneValue(match[3]!) : "";
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
        query = luceneFilter(db, query, trimmedQ, [
          "resource_servers.name",
          "resource_servers.identifier",
        ]);
      }
    }

    // Keyset (checkpoint) pagination: from/take. Fixed created_at desc order
    // with an id tiebreaker; no total, matching Auth0's checkpoint responses.
    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(
        query.selectAll(),
        params,
        { sortColumn: "created_at", sortOrder: "desc", idColumn: "id" },
      );
      const pageResourceServers = rows.map(transformResourceServer);
      return {
        resource_servers: pageResourceServers,
        start: 0,
        limit,
        length: pageResourceServers.length,
        next,
      };
    }

    const filteredQuery = query.offset(page * per_page).limit(per_page);

    const rows = await filteredQuery.selectAll().execute();
    const resource_servers: ResourceServer[] = rows.map(
      transformResourceServer,
    );

    if (!include_totals) {
      return {
        resource_servers,
        start: 0,
        limit: 0,
        length: 0,
      };
    }

    const { count } = await query
      .select((eb) => eb.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    return {
      resource_servers,
      start: page * per_page,
      limit: per_page,
      length: getCountAsInt(count),
    };
  };
}
