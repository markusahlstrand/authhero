import { Kysely } from "kysely";
import {
  ResourceServer,
  ResourceServerInsert,
  resourceServerSchema,
} from "@authhero/adapter-interfaces";
import { Database, sqlResourceServerSchema } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { z } from "@hono/zod-openapi";
import { generateResourceServerId } from "../utils/entity-id";

type ResourceServerDbInsert = z.infer<typeof sqlResourceServerSchema>;

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ResourceServerInsert,
  ): Promise<ResourceServer> => {
    const now = new Date().toISOString();
    const withDefaults = {
      id: generateResourceServerId(),
      ...params,
      created_at: now,
      updated_at: now,
    };

    const resourceServer = resourceServerSchema.parse(withDefaults);

    const {
      verificationKey,
      scopes,
      options,
      skip_consent_for_verifiable_first_party_clients,
      allow_offline_access,
      ...rest
    } = resourceServer;

    const dbResourceServer: ResourceServerDbInsert = {
      ...rest,
      tenant_id,
      scopes: scopes ? JSON.stringify(scopes) : "[]",
      options: options ? JSON.stringify(options) : "{}",
      skip_consent_for_verifiable_first_party_clients:
        skip_consent_for_verifiable_first_party_clients ? 1 : 0,
      allow_offline_access: allow_offline_access ? 1 : 0,
      verification_key: verificationKey,
      created_at: now,
      updated_at: now,
    };

    await db.insertInto("resource_servers").values(dbResourceServer).execute();

    return removeNullProperties(resourceServer);
  };
}
