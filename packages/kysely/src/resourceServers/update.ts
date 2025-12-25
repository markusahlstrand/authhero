import { Kysely } from "kysely";
import { ResourceServer } from "@authhero/adapter-interfaces";
import { Database, sqlResourceServerSchema } from "../db";
import { z } from "@hono/zod-openapi";

// Get the database schema type from db.ts
type ResourceServerDbUpdate = Partial<z.infer<typeof sqlResourceServerSchema>>;

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    params: Partial<ResourceServer>,
  ): Promise<boolean> => {
    const {
      verificationKey,
      scopes,
      options,
      skip_consent_for_verifiable_first_party_clients,
      allow_offline_access,
      synced,
      ...rest
    } = params;

    // Build updates object with proper database types
    const updates: ResourceServerDbUpdate = {
      ...rest,
      updated_at: new Date().toISOString(),
    };

    // Handle snake_case conversion for database
    if (verificationKey !== undefined) {
      updates.verification_key = verificationKey;
    }

    // Handle JSON serialization
    if (scopes !== undefined) {
      updates.scopes = JSON.stringify(scopes);
    }
    if (options !== undefined) {
      // For options, we need to merge with existing options to avoid overwriting
      const existingResourceServer = await db
        .selectFrom("resource_servers")
        .select("options")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();

      const existingOptions = existingResourceServer?.options
        ? JSON.parse(existingResourceServer.options)
        : {};

      const mergedOptions = { ...existingOptions, ...options };
      updates.options = JSON.stringify(mergedOptions);
    }

    // Handle boolean to integer conversion
    if (skip_consent_for_verifiable_first_party_clients !== undefined) {
      updates.skip_consent_for_verifiable_first_party_clients =
        skip_consent_for_verifiable_first_party_clients ? 1 : 0;
    }
    if (allow_offline_access !== undefined) {
      updates.allow_offline_access = allow_offline_access ? 1 : 0;
    }
    if (synced !== undefined) {
      updates.synced = synced ? 1 : 0;
    }

    const result = await db
      .updateTable("resource_servers")
      .set(updates)
      .where("tenant_id", "=", tenant_id)
      .where("id", "=", id)
      .executeTakeFirst();

    return Number(result.numUpdatedRows) > 0;
  };
}
