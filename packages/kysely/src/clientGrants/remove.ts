import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("client_grants")
      .where("client_grants.tenant_id", "=", tenant_id)
      .where("client_grants.id", "=", id)
      .executeTakeFirst();

    return (result.numDeletedRows ?? 0n) > 0n;
  };
}
