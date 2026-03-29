import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, user_id: string): Promise<boolean> => {
    // Planetscale has no cascading delete as it has no FK
    // so we manually remove related rows before deleting users
    await db
      .deleteFrom("authentication_methods")
      .where("authentication_methods.tenant_id", "=", tenant_id)
      .where("authentication_methods.user_id", "in", (qb) =>
        qb
          .selectFrom("users")
          .select("users.user_id")
          .where("users.tenant_id", "=", tenant_id)
          .where((eb) =>
            eb.or([
              eb("users.user_id", "=", user_id),
              eb("users.linked_to", "=", user_id),
            ]),
          ),
      )
      .execute();

    await db
      .deleteFrom("users")
      .where("users.tenant_id", "=", tenant_id)
      .where("users.linked_to", "=", user_id)
      .execute();

    const results = await db
      .deleteFrom("users")
      .where("users.tenant_id", "=", tenant_id)
      .where("users.user_id", "=", user_id)
      .execute();

    return results.length === 1;
  };
}
