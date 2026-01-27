import { Client, Totals } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { ListParams } from "@authhero/adapter-interfaces";

export function list(db: Kysely<Database>) {
  return async (
    tenantId: string,
    params?: ListParams,
  ): Promise<{ clients: Client[]; totals?: Totals }> => {
    let query = db
      .selectFrom("clients")
      .where("clients.tenant_id", "=", tenantId);

    if (params?.per_page) {
      query = query.limit(params.per_page);
    }

    if (params?.page && params?.per_page) {
      query = query.offset((params.page - 1) * params.per_page);
    }

    const results = await query.selectAll().execute();
    const clients: Client[] = results.map((result) => ({
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
    }));

    return {
      clients,
    };
  };
}
