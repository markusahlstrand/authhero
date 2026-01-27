import { Kysely } from "kysely";
import { Client } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { stringifyProperties, booleanToInt } from "../helpers/stringify";

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

    // Convert boolean fields to integers
    booleanToInt(
      client,
      [
        "global",
        "is_first_party",
        "oidc_conformant",
        "auth0_conformant",
        "sso",
        "sso_disabled",
        "cross_origin_authentication",
        "custom_login_page_on",
        "require_pushed_authorization_requests",
        "require_proof_of_possession",
      ],
      updateData,
    );

    // Convert array/object fields to JSON strings if they exist in the update
    stringifyProperties(
      client,
      [
        "callbacks",
        "allowed_origins",
        "web_origins",
        "client_aliases",
        "allowed_clients",
        "connections",
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
