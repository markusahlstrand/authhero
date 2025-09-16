import { Kysely } from "kysely";
import { Client } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    client_id: string,
    client: Partial<Client>,
  ): Promise<boolean> => {
    const updateData: any = {
      ...client,
      updated_at: new Date().toISOString(),
    };

    // Convert boolean fields to integers if they exist in the update
    if (client.global !== undefined) {
      updateData.global = client.global ? 1 : 0;
    }
    if (client.is_first_party !== undefined) {
      updateData.is_first_party = client.is_first_party ? 1 : 0;
    }
    if (client.oidc_conformant !== undefined) {
      updateData.oidc_conformant = client.oidc_conformant ? 1 : 0;
    }
    if (client.sso !== undefined) {
      updateData.sso = client.sso ? 1 : 0;
    }
    if (client.sso_disabled !== undefined) {
      updateData.sso_disabled = client.sso_disabled ? 1 : 0;
    }
    if (client.cross_origin_authentication !== undefined) {
      updateData.cross_origin_authentication =
        client.cross_origin_authentication ? 1 : 0;
    }
    if (client.custom_login_page_on !== undefined) {
      updateData.custom_login_page_on = client.custom_login_page_on ? 1 : 0;
    }
    if (client.require_pushed_authorization_requests !== undefined) {
      updateData.require_pushed_authorization_requests =
        client.require_pushed_authorization_requests ? 1 : 0;
    }
    if (client.require_proof_of_possession !== undefined) {
      updateData.require_proof_of_possession =
        client.require_proof_of_possession ? 1 : 0;
    }

    // Convert array/object fields to JSON strings if they exist in the update
    if (client.callbacks !== undefined) {
      updateData.callbacks = JSON.stringify(client.callbacks);
    }
    if (client.allowed_origins !== undefined) {
      updateData.allowed_origins = JSON.stringify(client.allowed_origins);
    }
    if (client.web_origins !== undefined) {
      updateData.web_origins = JSON.stringify(client.web_origins);
    }
    if (client.client_aliases !== undefined) {
      updateData.client_aliases = JSON.stringify(client.client_aliases);
    }
    if (client.allowed_clients !== undefined) {
      updateData.allowed_clients = JSON.stringify(client.allowed_clients);
    }
    if (client.allowed_logout_urls !== undefined) {
      updateData.allowed_logout_urls = JSON.stringify(
        client.allowed_logout_urls,
      );
    }
    if (client.session_transfer !== undefined) {
      updateData.session_transfer = JSON.stringify(client.session_transfer);
    }
    if (client.oidc_logout !== undefined) {
      updateData.oidc_logout = JSON.stringify(client.oidc_logout);
    }
    if (client.grant_types !== undefined) {
      updateData.grant_types = JSON.stringify(client.grant_types);
    }
    if (client.jwt_configuration !== undefined) {
      updateData.jwt_configuration = JSON.stringify(client.jwt_configuration);
    }
    if (client.signing_keys !== undefined) {
      updateData.signing_keys = JSON.stringify(client.signing_keys);
    }
    if (client.encryption_key !== undefined) {
      updateData.encryption_key = JSON.stringify(client.encryption_key);
    }
    if (client.addons !== undefined) {
      updateData.addons = JSON.stringify(client.addons);
    }
    if (client.client_metadata !== undefined) {
      updateData.client_metadata = JSON.stringify(client.client_metadata);
    }
    if (client.mobile !== undefined) {
      updateData.mobile = JSON.stringify(client.mobile);
    }
    if (client.native_social_login !== undefined) {
      updateData.native_social_login = JSON.stringify(
        client.native_social_login,
      );
    }
    if (client.refresh_token !== undefined) {
      updateData.refresh_token = JSON.stringify(client.refresh_token);
    }
    if (client.default_organization !== undefined) {
      updateData.default_organization = JSON.stringify(
        client.default_organization,
      );
    }
    if (client.client_authentication_methods !== undefined) {
      updateData.client_authentication_methods = JSON.stringify(
        client.client_authentication_methods,
      );
    }
    if (client.signed_request_object !== undefined) {
      updateData.signed_request_object = JSON.stringify(
        client.signed_request_object,
      );
    }
    if (client.token_quota !== undefined) {
      updateData.token_quota = JSON.stringify(client.token_quota);
    }

    const result = await db
      .updateTable("clients")
      .set(updateData)
      .where("clients.tenant_id", "=", tenant_id)
      .where("clients.client_id", "=", client_id)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  };
}
