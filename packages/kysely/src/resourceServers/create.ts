import { Kysely } from "kysely";
import {
  ResourceServer,
  ResourceServerInsert,
  resourceServerSchema,
  CreateOptions,
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
    createOptions?: CreateOptions,
  ): Promise<ResourceServer> => {
    const importMetadata = createOptions?.importMetadata;
    const now = new Date().toISOString();
    const created_at = importMetadata?.created_at ?? now;
    const updated_at = importMetadata?.updated_at ?? now;
    const withDefaults = {
      ...params,
      id: importMetadata?.id ?? params.id ?? generateResourceServerId(),
      created_at,
      updated_at,
    };

    const resourceServer = resourceServerSchema.parse(withDefaults);

    const {
      verificationKey,
      scopes,
      options,
      skip_consent_for_verifiable_first_party_clients,
      allow_offline_access,
      is_system,
      metadata,
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
      is_system: is_system ? 1 : 0,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
      verification_key: verificationKey,
      created_at,
      updated_at,
    };

    await db.insertInto("resource_servers").values(dbResourceServer).execute();

    return removeNullProperties(resourceServer);
  };
}
