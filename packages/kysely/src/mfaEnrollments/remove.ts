import { Kysely } from "kysely";
import { Database } from "../db";

export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, enrollment_id: string): Promise<boolean> => {
    const result = await db
      .deleteFrom("mfa_enrollments")
      .where("mfa_enrollments.tenant_id", "=", tenant_id)
      .where("mfa_enrollments.id", "=", enrollment_id)
      .executeTakeFirst();

    return result.numDeletedRows > 0;
  };
}
