import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { ClientWithTenantId } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function getByClientId(db: Kysely<Database>) {
  return async (client_id: string): Promise<ClientWithTenantId | null> => {
    const client = await db
      .selectFrom("clients")
      .where("clients.client_id", "=", client_id)
      .selectAll()
      .executeTakeFirst();

    if (!client) {
      return null;
    }

    return removeNullProperties({
      ...client,
      // Convert integer fields back to booleans
      global: !!client.global,
      is_first_party: !!client.is_first_party,
      oidc_conformant: !!client.oidc_conformant,
      auth0_conformant: !!client.auth0_conformant,
      sso: !!client.sso,
      sso_disabled: !!client.sso_disabled,
      cross_origin_authentication: !!client.cross_origin_authentication,
      custom_login_page_on: !!client.custom_login_page_on,
      require_pushed_authorization_requests:
        !!client.require_pushed_authorization_requests,
      require_proof_of_possession: !!client.require_proof_of_possession,
      // Parse JSON string fields back to objects/arrays
      callbacks: JSON.parse(client.callbacks),
      allowed_origins: JSON.parse(client.allowed_origins),
      web_origins: JSON.parse(client.web_origins),
      client_aliases: JSON.parse(client.client_aliases),
      allowed_clients: JSON.parse(client.allowed_clients),
      connections: JSON.parse(client.connections || "[]"),
      allowed_logout_urls: JSON.parse(client.allowed_logout_urls),
      session_transfer: JSON.parse(client.session_transfer),
      oidc_logout: JSON.parse(client.oidc_logout),
      grant_types: JSON.parse(client.grant_types),
      jwt_configuration: JSON.parse(client.jwt_configuration),
      signing_keys: JSON.parse(client.signing_keys),
      encryption_key: JSON.parse(client.encryption_key),
      addons: JSON.parse(client.addons),
      client_metadata: JSON.parse(client.client_metadata),
      mobile: JSON.parse(client.mobile),
      native_social_login: JSON.parse(client.native_social_login),
      refresh_token: JSON.parse(client.refresh_token),
      default_organization: JSON.parse(client.default_organization),
      client_authentication_methods: JSON.parse(
        client.client_authentication_methods,
      ),
      signed_request_object: JSON.parse(client.signed_request_object),
      token_quota: JSON.parse(client.token_quota),
    });
  };
}
