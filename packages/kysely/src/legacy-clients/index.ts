import { Kysely } from "kysely";
import { HTTPException } from "hono/http-exception";
import { removeNullProperties } from "../helpers/remove-nulls";
import { LegacyClient, connectionSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function createLegacyClientsAdapter(db: Kysely<Database>) {
  return {
    get: async (clientId: string) => {
      const client = await db
        .selectFrom("clients")
        .selectAll()
        .where("client_id", "=", clientId)
        .executeTakeFirst();

      if (!client) {
        return null;
      }

      const tenant = await db
        .selectFrom("tenants")
        .selectAll()
        .where("id", "=", client.tenant_id)
        .executeTakeFirst();

      if (!tenant) {
        throw new HTTPException(404, { message: "Tenant not found" });
      }

      const connections = await db
        .selectFrom("connections")
        .where("tenant_id", "=", client.tenant_id)
        .selectAll()
        .execute();

      const clientMetadata = client.client_metadata
        ? JSON.parse(client.client_metadata)
        : {};

      const legacyClient: LegacyClient = {
        ...client,
        // Convert integer fields back to booleans
        global: !!client.global,
        is_first_party: !!client.is_first_party,
        oidc_conformant: !!client.oidc_conformant,
        sso: !!client.sso,
        sso_disabled: !!client.sso_disabled,
        cross_origin_authentication: !!client.cross_origin_authentication,
        custom_login_page_on: !!client.custom_login_page_on,
        require_pushed_authorization_requests:
          !!client.require_pushed_authorization_requests,
        require_proof_of_possession: !!client.require_proof_of_possession,
        // Parse JSON string fields back to objects/arrays
        connections: connections.map((connection) => {
          const { is_system, ...rest } = connection;
          return connectionSchema.parse(
            removeNullProperties({
              ...rest,
              is_system: is_system ? true : undefined,
              options: connection.options ? JSON.parse(connection.options) : {},
            }),
          );
        }),
        addons: client.addons ? JSON.parse(client.addons) : {},
        callbacks: client.callbacks ? JSON.parse(client.callbacks) : [],
        allowed_origins: client.allowed_origins
          ? JSON.parse(client.allowed_origins)
          : [],
        web_origins: client.web_origins ? JSON.parse(client.web_origins) : [],
        client_aliases: client.client_aliases
          ? JSON.parse(client.client_aliases)
          : [],
        allowed_clients: client.allowed_clients
          ? JSON.parse(client.allowed_clients)
          : [],
        allowed_logout_urls: client.allowed_logout_urls
          ? JSON.parse(client.allowed_logout_urls)
          : [],
        session_transfer: client.session_transfer
          ? JSON.parse(client.session_transfer)
          : {},
        oidc_logout: client.oidc_logout ? JSON.parse(client.oidc_logout) : {},
        grant_types: client.grant_types ? JSON.parse(client.grant_types) : [],
        jwt_configuration: client.jwt_configuration
          ? JSON.parse(client.jwt_configuration)
          : {},
        signing_keys: client.signing_keys
          ? JSON.parse(client.signing_keys)
          : [],
        encryption_key: client.encryption_key
          ? JSON.parse(client.encryption_key)
          : {},
        client_metadata: clientMetadata,
        mobile: client.mobile ? JSON.parse(client.mobile) : {},
        native_social_login: client.native_social_login
          ? JSON.parse(client.native_social_login)
          : {},
        refresh_token: client.refresh_token
          ? JSON.parse(client.refresh_token)
          : {},
        default_organization: client.default_organization
          ? JSON.parse(client.default_organization)
          : {},
        client_authentication_methods: client.client_authentication_methods
          ? JSON.parse(client.client_authentication_methods)
          : {},
        signed_request_object: client.signed_request_object
          ? JSON.parse(client.signed_request_object)
          : {},
        token_quota: client.token_quota ? JSON.parse(client.token_quota) : {},
        tenant: removeNullProperties(tenant),
      };

      return legacyClient;
    },
  };
}
