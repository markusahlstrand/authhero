import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    roles: string[],
  ): Promise<boolean> => {
    try {
      if (!roles.length) return true;

      await db
        .deleteFrom("user_roles")
        .where("tenant_id", "=", tenant_id)
        .where("user_id", "=", user_id)
        .where((eb) => eb("role_id", "in", roles))
        .execute();

      return true;
    } catch (error) {
      console.error("Error removing user roles:", error);
      return false;
    }
  };
}
