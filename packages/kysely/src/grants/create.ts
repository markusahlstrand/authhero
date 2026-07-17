import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Grant, GrantInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, grant: GrantInsert): Promise<Grant> => {
    const now = new Date().toISOString();
    const requestedScope = grant.scope ?? [];
    const audience = grant.audience ?? "";

    const existing = await db
      .selectFrom("grants")
      .where("tenant_id", "=", tenant_id)
      .where("user_id", "=", grant.user_id)
      .where("client_id", "=", grant.clientID)
      .where("audience", "=", audience)
      .selectAll()
      .executeTakeFirst();

    if (existing) {
      const existingScope: string[] = existing.scope
        ? JSON.parse(existing.scope)
        : [];
      const merged = Array.from(new Set([...existingScope, ...requestedScope]));

      await db
        .updateTable("grants")
        .set({ scope: JSON.stringify(merged), updated_at: now })
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", existing.id)
        .execute();

      return {
        id: existing.id,
        user_id: existing.user_id,
        clientID: existing.client_id,
        audience: existing.audience || undefined,
        scope: merged,
      };
    }

    const id = nanoid();
    await db
      .insertInto("grants")
      .values({
        id,
        tenant_id,
        user_id: grant.user_id,
        client_id: grant.clientID,
        audience,
        scope: JSON.stringify(requestedScope),
        created_at: now,
        updated_at: now,
      })
      .execute();

    return {
      id,
      user_id: grant.user_id,
      clientID: grant.clientID,
      audience: audience || undefined,
      scope: requestedScope,
    };
  };
}
