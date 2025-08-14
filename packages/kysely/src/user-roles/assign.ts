import { Kysely } from "kysely";
import { Database } from "../db";

export function assign(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    roles: string[],
  ): Promise<boolean> => {
    if (roles.length === 0) return true;

    const now = new Date().toISOString();

    try {
      for (const role_id of roles) {
        try {
          await db
            .insertInto("user_roles")
            .values({ tenant_id, user_id, role_id, created_at: now })
            .execute();
        } catch (error: any) {
          if (
            error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
            error.code === "SQLITE_CONSTRAINT_UNIQUE"
          ) {
            continue;
          }
          throw error;
        }
      }
      return true;
    } catch (error) {
      console.error("Error assigning user roles:", error);
      return false;
    }
  };
}
