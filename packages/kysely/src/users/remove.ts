import { Kysely } from "kysely";
import { WriteOptions } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { insertOutboxEvent } from "../outbox/create";

export function remove(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    options?: WriteOptions,
  ): Promise<boolean> => {
    // Planetscale has no cascading delete as it has no FK
    // so we manually remove related rows before deleting users
    const execute = async (trx: Kysely<Database>): Promise<boolean> => {
      await trx
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

      await trx
        .deleteFrom("users")
        .where("users.tenant_id", "=", tenant_id)
        .where("users.linked_to", "=", user_id)
        .execute();

      const results = await trx
        .deleteFrom("users")
        .where("users.tenant_id", "=", tenant_id)
        .where("users.user_id", "=", user_id)
        .execute();

      // Companion outbox events (issue #1057): the post-deletion event commits
      // in the same transaction as the deletes, so a crash between them can
      // never drop the event while the user is gone (or vice versa).
      // Scope the outbox row to the operation's tenant, not `event.tenant_id`,
      // so a companion event can never drift into a different tenant than the
      // user delete it commits with.
      for (const event of options?.outboxEvents ?? []) {
        await insertOutboxEvent(trx, tenant_id, event.id, event);
      }

      return results.length === 1;
    };

    // Only pay for a transaction when there are companion events to keep atomic
    // with the deletes; otherwise preserve the historical non-transactional
    // cascade.
    if (options?.outboxEvents?.length && !db.isTransaction) {
      return db.transaction().execute(execute);
    }
    return execute(db);
  };
}
