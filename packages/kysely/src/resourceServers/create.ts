import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import {
  ResourceServer,
  ResourceServerInsert,
  resourceServerSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ResourceServerInsert,
  ): Promise<ResourceServer> => {
    const withDefaults = {
      id: nanoid(),
      ...params,
    } as any;

    const resourceServer = resourceServerSchema.parse(withDefaults);

    const { verificationKey, ...dbResourceServer } = resourceServer;

    await db
      .insertInto("resource_servers")
      .values({
        ...dbResourceServer,
        tenant_id,
        scopes: resourceServer.scopes
          ? JSON.stringify(resourceServer.scopes)
          : "[]",
        options: resourceServer.options
          ? JSON.stringify(resourceServer.options)
          : "{}",
        skip_consent_for_verifiable_first_party_clients:
          resourceServer.skip_consent_for_verifiable_first_party_clients
            ? 1
            : 0,
        allow_offline_access: resourceServer.allow_offline_access ? 1 : 0,
        // Convert verificationKey to verification_key for database
        verification_key: verificationKey,
      })
      .execute();

    return resourceServer;
  };
}
