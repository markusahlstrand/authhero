import { Client, Totals } from "@authhero/adapter-interfaces";
import { Kysely, Selectable, sql } from "kysely";
import { Database } from "../db";
import { ListParams } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";
import { keysetPaginate, isKeysetRequest } from "../helpers/paginate";

function sqlToClient(result: Selectable<Database["clients"]>): Client {
  return removeNullProperties<Client>({
    ...result,
    // Convert integer fields back to booleans
    global: !!result.global,
    is_first_party: !!result.is_first_party,
    oidc_conformant: !!result.oidc_conformant,
    auth0_conformant: !!result.auth0_conformant,
    sso: !!result.sso,
    sso_disabled: !!result.sso_disabled,
    cross_origin_authentication: !!result.cross_origin_authentication,
    custom_login_page_on: !!result.custom_login_page_on,
    require_pushed_authorization_requests:
      !!result.require_pushed_authorization_requests,
    require_proof_of_possession: !!result.require_proof_of_possession,
    hide_sign_up_disabled_error: !!result.hide_sign_up_disabled_error,
    // Parse JSON string fields back to objects/arrays
    callbacks: JSON.parse(result.callbacks),
    allowed_origins: JSON.parse(result.allowed_origins),
    web_origins: JSON.parse(result.web_origins),
    client_aliases: JSON.parse(result.client_aliases),
    allowed_clients: JSON.parse(result.allowed_clients),
    connections: JSON.parse(result.connections || "[]"),
    allowed_logout_urls: JSON.parse(result.allowed_logout_urls),
    session_transfer: JSON.parse(result.session_transfer),
    oidc_logout: JSON.parse(result.oidc_logout),
    grant_types: JSON.parse(result.grant_types),
    jwt_configuration: JSON.parse(result.jwt_configuration),
    signing_keys: JSON.parse(result.signing_keys),
    encryption_key: JSON.parse(result.encryption_key),
    addons: JSON.parse(result.addons),
    client_metadata: JSON.parse(result.client_metadata),
    mobile: JSON.parse(result.mobile),
    native_social_login: JSON.parse(result.native_social_login),
    refresh_token: JSON.parse(result.refresh_token),
    default_organization: JSON.parse(result.default_organization),
    client_authentication_methods: JSON.parse(
      result.client_authentication_methods,
    ),
    signed_request_object: JSON.parse(result.signed_request_object),
    token_quota: JSON.parse(result.token_quota),
    registration_metadata: result.registration_metadata
      ? JSON.parse(result.registration_metadata)
      : undefined,
  });
}

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<{ clients: Client[]; totals?: Totals }> => {
    let query = db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenantId);

    // Lucene-style `field:"value"` matches do exact equality on the named
    // column. Right now only `owner_user_id` and `registration_type` are
    // surfaced — both are first-class columns added for RFC 7591 DCR.
    // Anything else falls back to the legacy substring search across
    // `name` + `client_id`.
    const exactMatchableFields = new Set([
      "owner_user_id",
      "registration_type",
    ]);
    if (params?.q) {
      const trimmed = params.q.trim();
      const exactMatch = trimmed.match(
        /^([a-zA-Z_][a-zA-Z0-9_]*):"?([^"]*)"?$/,
      );
      if (
        exactMatch &&
        exactMatchableFields.has(exactMatch[1]!) &&
        exactMatch[2]
      ) {
        const fieldName = exactMatch[1] as
          | "owner_user_id"
          | "registration_type";
        query = query.where(fieldName, "=", exactMatch[2]!);
      } else {
        query = query.where((eb) =>
          eb.or([
            eb("name", "like", `%${params.q}%`),
            eb("client_id", "like", `%${params.q}%`),
          ]),
        );
      }
    }

    // Keyset (checkpoint) pagination: from/take. Fixed created_at desc order
    // with client_id tiebreaker; no total, matching Auth0's checkpoint
    // responses.
    if (isKeysetRequest(params)) {
      const { rows, limit, next } = await keysetPaginate(
        query.selectAll(),
        params,
        { sortColumn: "created_at", sortOrder: "desc", idColumn: "client_id" },
      );
      const clients = rows.map(sqlToClient);
      return {
        clients,
        totals: { start: 0, limit, length: clients.length, next },
      };
    }

    // Offset pagination.
    if (params?.sort) {
      const sortOrder = params.sort.sort_order === "asc" ? "asc" : "desc";
      const sortBy = params.sort.sort_by as
        | "name"
        | "client_id"
        | "created_at"
        | "updated_at";
      if (["name", "client_id", "created_at", "updated_at"].includes(sortBy)) {
        query = query.orderBy(sortBy, sortOrder);
      } else {
        query = query.orderBy("created_at", "desc");
      }
    } else {
      query = query.orderBy("created_at", "desc");
    }

    const page = params?.page ?? 0;
    const limit = params?.per_page || 10;

    const results = await query
      .selectAll()
      .limit(limit)
      .offset(page * limit)
      .execute();

    // Get total count for include_totals
    let total = results.length;
    if (params?.include_totals) {
      let countQuery = db
        .selectFrom("clients")
        .select(sql<number>`count(*)`.as("count"))
        .where("clients.tenant_id", "=", tenantId);

      if (params?.q) {
        const trimmed = params.q.trim();
        const exactMatch = trimmed.match(
          /^([a-zA-Z_][a-zA-Z0-9_]*):"?([^"]*)"?$/,
        );
        if (
          exactMatch &&
          exactMatchableFields.has(exactMatch[1]!) &&
          exactMatch[2]
        ) {
          const fieldName = exactMatch[1] as
            | "owner_user_id"
            | "registration_type";
          countQuery = countQuery.where(fieldName, "=", exactMatch[2]!);
        } else {
          countQuery = countQuery.where((eb) =>
            eb.or([
              eb("name", "like", `%${params.q}%`),
              eb("client_id", "like", `%${params.q}%`),
            ]),
          );
        }
      }

      const countResult = await countQuery.executeTakeFirst();
      total = Number(countResult?.count || 0);
    }

    const clients: Client[] = results.map(sqlToClient);

    return {
      clients,
      totals: {
        start: page * limit,
        limit,
        length: clients.length,
        total,
      },
    };
  };
}
