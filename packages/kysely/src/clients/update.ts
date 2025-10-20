import { Kysely } from "kysely";
import { Client } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { stringifyProperties } from "../helpers/stringify";

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
    stringifyProperties(
      client,
      [
        "callbacks",
        "allowed_origins",
        "web_origins",
        "client_aliases",
        "allowed_clients",
        "allowed_logout_urls",
        "session_transfer",
        "oidc_logout",
        "grant_types",
        "jwt_configuration",
        "signing_keys",
        "encryption_key",
        "addons",
        "client_metadata",
        "mobile",
        "native_social_login",
        "refresh_token",
        "default_organization",
        "client_authentication_methods",
        "signed_request_object",
        "token_quota",
      ],
      updateData,
    );

    const result = await db
      .updateTable("clients")
      .set(updateData)
      .where("clients.tenant_id", "=", tenant_id)
      .where("clients.client_id", "=", client_id)
      .executeTakeFirst();

    return result.numUpdatedRows > 0;
  };
}
