import { Kysely } from "kysely";
import { Client, ClientInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, params: ClientInsert): Promise<Client> => {
    const client: Client = {
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...params,
      // Ensure required boolean fields have defaults
      global: params.global ?? false,
      is_first_party: params.is_first_party ?? false,
      oidc_conformant: params.oidc_conformant ?? true,
      sso: params.sso ?? false,
      sso_disabled: params.sso_disabled ?? true,
      cross_origin_authentication: params.cross_origin_authentication ?? false,
      custom_login_page_on: params.custom_login_page_on ?? false,
      require_pushed_authorization_requests:
        params.require_pushed_authorization_requests ?? false,
      require_proof_of_possession: params.require_proof_of_possession ?? false,
    };

    await db
      .insertInto("clients")
      .values({
        ...client,
        tenant_id,
        // Convert boolean fields to integers for SQL storage
        global: params.global ? 1 : 0,
        is_first_party: params.is_first_party ? 1 : 0,
        oidc_conformant: params.oidc_conformant ? 1 : 0,
        sso: params.sso ? 1 : 0,
        sso_disabled: params.sso_disabled ? 1 : 0,
        cross_origin_authentication: params.cross_origin_authentication ? 1 : 0,
        custom_login_page_on: params.custom_login_page_on ? 1 : 0,
        require_pushed_authorization_requests:
          params.require_pushed_authorization_requests ? 1 : 0,
        require_proof_of_possession: params.require_proof_of_possession ? 1 : 0,
        // Convert array/object fields to JSON strings for SQL storage
        callbacks: JSON.stringify(params.callbacks || []),
        allowed_origins: JSON.stringify(params.allowed_origins || []),
        web_origins: JSON.stringify(params.web_origins || []),
        client_aliases: JSON.stringify(params.client_aliases || []),
        allowed_clients: JSON.stringify(params.allowed_clients || []),
        allowed_logout_urls: JSON.stringify(params.allowed_logout_urls || []),
        session_transfer: JSON.stringify(params.session_transfer || {}),
        oidc_logout: JSON.stringify(params.oidc_logout || {}),
        grant_types: JSON.stringify(params.grant_types || []),
        jwt_configuration: JSON.stringify(params.jwt_configuration || {}),
        signing_keys: JSON.stringify(params.signing_keys || []),
        encryption_key: JSON.stringify(params.encryption_key || {}),
        addons: JSON.stringify(params.addons || {}),
        client_metadata: JSON.stringify(params.client_metadata || {}),
        mobile: JSON.stringify(params.mobile || {}),
        native_social_login: JSON.stringify(params.native_social_login || {}),
        refresh_token: JSON.stringify(params.refresh_token || {}),
        default_organization: JSON.stringify(params.default_organization || {}),
        client_authentication_methods: JSON.stringify(
          params.client_authentication_methods || {},
        ),
        signed_request_object: JSON.stringify(
          params.signed_request_object || {},
        ),
        token_quota: JSON.stringify(params.token_quota || {}),
      })
      .execute();

    return client;
  };
}
