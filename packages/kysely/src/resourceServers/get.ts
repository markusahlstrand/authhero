import { Kysely } from "kysely";
import { ResourceServer } from "@authhero/adapter-interfaces";
import { Database, sqlResourceServerSchema } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { z } from "@hono/zod-openapi";

type ResourceServerDbRow = z.infer<typeof sqlResourceServerSchema>;

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
  ): Promise<ResourceServer | null> => {
    const row = await db
      .selectFrom("resource_servers")
      .selectAll()
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .executeTakeFirst();

    if (!row) return null;

    const dbRow = row as ResourceServerDbRow;
    const {
      verification_key,
      scopes,
      options,
      skip_consent_for_verifiable_first_party_clients,
      allow_offline_access,
      is_system,
      metadata,
      ...rest
    } = dbRow;

    const resourceServer: ResourceServer = {
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
    };

    return removeNullProperties(resourceServer);
  };
}
