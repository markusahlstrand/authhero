import { Kysely } from "kysely";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
    role_id: string,
    organization_id?: string,
  ): Promise<boolean> => {
    const now = new Date().toISOString();

    try {
      await db
        .insertInto("user_roles")
        .values({
          tenant_id,
          user_id,
          role_id,
          organization_id: organization_id || "",
          created_at: now,
        })
        .execute();

      return true;
    } catch (error: any) {
      // Handle duplicate primary key or unique constraint errors gracefully
      if (
        error.code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
        error.code === "SQLITE_CONSTRAINT_UNIQUE" ||
        error.code === "SQLITE_CONSTRAINT" ||
        (error.message && error.message.includes("UNIQUE constraint failed")) ||
        (error.message &&
          error.message.includes("PRIMARY KEY constraint failed"))
      ) {
        // Role already exists, this is fine for idempotent operation
        return true;
      }

      console.error("Error creating user role:", error);
      return false;
    }
  };
}
