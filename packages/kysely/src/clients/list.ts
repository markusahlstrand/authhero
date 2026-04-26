import { Client, Totals } from "@authhero/adapter-interfaces";
import { Kysely, sql } from "kysely";
import { Database } from "../db";
import { ListParams } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<{ clients: Client[]; totals?: Totals }> => {
    let query = db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenantId);

    // Apply search filter if q is provided
    if (params?.q) {
      query = query.where((eb) =>
        eb.or([
          eb("name", "like", `%${params.q}%`),
          eb("client_id", "like", `%${params.q}%`),
        ]),
      );
    }

    // Apply sorting
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

    // Handle checkpoint pagination (from/take)
    if (params?.from !== undefined) {
      const offset = parseInt(params.from, 10);
      if (!isNaN(offset)) {
        query = query.offset(offset);
      }
    } else if (params?.page !== undefined) {
      const perPage = params?.per_page || params?.take || 10;
      const offset = params.page * perPage;
      query = query.offset(offset);
    }

    // Apply limit (take or per_page)
    const limit = params?.take || params?.per_page || 10;
    query = query.limit(limit);

    const results = await query.selectAll().execute();

    // Get total count for include_totals
    let total = results.length;
    if (params?.include_totals) {
      let countQuery = db
        .selectFrom("clients")
        .select(sql<number>`count(*)`.as("count"))
        .where("clients.tenant_id", "=", tenantId);

      if (params?.q) {
        countQuery = countQuery.where((eb) =>
          eb.or([
            eb("name", "like", `%${params.q}%`),
            eb("client_id", "like", `%${params.q}%`),
          ]),
        );
      }

      const countResult = await countQuery.executeTakeFirst();
      total = Number(countResult?.count || 0);
    }

    const clients: Client[] = results.map((result) => removeNullProperties<Client>({
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
    }),
    );

    const perPage = params?.take || params?.per_page || 10;
    const start = params?.from
      ? parseInt(params.from, 10)
      : params?.page
        ? params.page * perPage
        : 0;

    return {
      clients,
      totals: {
        start: isNaN(start) ? 0 : start,
        limit: perPage,
        length: clients.length,
        total,
      },
    };
  };
}
