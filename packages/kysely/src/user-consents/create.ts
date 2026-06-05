import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { UserConsent, UserConsentInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    consent: UserConsentInsert,
  ): Promise<UserConsent> => {
    const now = new Date().toISOString();
    const requestedScopes = consent.scopes ?? [];

    const existing = await db
      .selectFrom("user_consents")
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", consent.user_id)
      .where("client_id", "=", consent.client_id)
      .selectAll()
      .executeTakeFirst();

    if (existing) {
      const existingScopes: string[] = existing.scopes
        ? JSON.parse(existing.scopes)
        : [];
      const merged = Array.from(
        new Set([...existingScopes, ...requestedScopes]),
      );

      await db
        .updateTable("user_consents")
        .set({ scopes: JSON.stringify(merged), updated_at: now })
        .where("tenant_id", "=", tenant_id)
        .where("user_id", "=", consent.user_id)
        .where("client_id", "=", consent.client_id)
        .execute();

      return {
        id: existing.id,
        user_id: existing.user_id,
        client_id: existing.client_id,
        scopes: merged,
        created_at: existing.created_at,
        updated_at: now,
      };
    }

    const id = nanoid();
    await db
      .insertInto("user_consents")
      .values({
        id,
        tenant_id,
        user_id: consent.user_id,
        client_id: consent.client_id,
        scopes: JSON.stringify(requestedScopes),
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id,
      user_id: consent.user_id,
      client_id: consent.client_id,
      scopes: requestedScopes,
      created_at: now,
      updated_at: now,
    };
  };
}
