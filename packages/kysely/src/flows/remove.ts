import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, flow_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("flows")
      .where("id", "=", flow_id)
      .where("tenant_id", "=", tenant_id)
      .execute();

    return (result[0]?.numDeletedRows ?? 0n) > 0n;
  };
}
