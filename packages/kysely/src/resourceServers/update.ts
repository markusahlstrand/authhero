import { Kysely } from "kysely";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    id: string,
    params: any,
  ): Promise<boolean> => {
    const { verificationKey, ...updates } = params;
    
    // Handle snake_case conversion for database
    if (verificationKey !== undefined) {
      updates.verification_key = verificationKey;
    }
    
    if (updates.scopes) updates.scopes = JSON.stringify(updates.scopes);
    if (updates.options) updates.options = JSON.stringify(updates.options);
    if (
      typeof updates.skip_consent_for_verifiable_first_party_clients ===
      "boolean"
    ) {
      updates.skip_consent_for_verifiable_first_party_clients =
        updates.skip_consent_for_verifiable_first_party_clients ? 1 : 0;
    }
    if (typeof updates.allow_offline_access === "boolean") {
      updates.allow_offline_access = updates.allow_offline_access ? 1 : 0;
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
