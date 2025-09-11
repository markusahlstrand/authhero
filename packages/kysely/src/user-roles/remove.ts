import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    role_id: string,
    organization_id?: string,
  ): Promise<boolean> => {
    try {
      let query = db
        .deleteFrom("user_roles")
        .where("tenant_id", "=", tenant_id)
        .where("user_id", "=", user_id)
        .where("role_id", "=", role_id);

      // Add organization filter if provided
      if (organization_id !== undefined) {
        query = query.where("organization_id", "=", organization_id);
      } else {
        // If no organization_id provided, only remove roles without organization context
        query = query.where("organization_id", "=", "");
      }

      await query.execute();

      return true;
    } catch (error) {
      console.error("Error removing user roles:", error);
      return false;
    }
  };
}
