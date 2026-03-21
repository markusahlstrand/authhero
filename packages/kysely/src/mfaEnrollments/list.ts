import { MfaEnrollment } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
  ): Promise<MfaEnrollment[]> => {
    const rows = await db
      .selectFrom("mfa_enrollments")
      .where("mfa_enrollments.tenant_id", "=", tenant_id)
      .where("mfa_enrollments.user_id", "=", user_id)
      .selectAll()
      .execute();

    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      type: row.type as MfaEnrollment["type"],
      phone_number: row.phone_number ?? undefined,
      totp_secret: row.totp_secret ?? undefined,
      confirmed: row.confirmed === 1,
      created_at: new Date(row.created_at_ts).toISOString(),
      updated_at: new Date(row.updated_at_ts).toISOString(),
    }));
  };
}
