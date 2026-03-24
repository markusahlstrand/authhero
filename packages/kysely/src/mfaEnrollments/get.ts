import { MfaEnrollment } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { dbDateToIsoRequired } from "../utils/dateConversion";

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    enrollment_id: string,
  ): Promise<MfaEnrollment | null> => {
    const row = await db
      .selectFrom("mfa_enrollments")
      .where("mfa_enrollments.tenant_id", "=", tenant_id)
      .where("mfa_enrollments.id", "=", enrollment_id)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      user_id: row.user_id,
      type: row.type as MfaEnrollment["type"],
      phone_number: row.phone_number ?? undefined,
      totp_secret: row.totp_secret ?? undefined,
      confirmed: row.confirmed === 1,
      created_at: dbDateToIsoRequired(row.created_at_ts),
      updated_at: dbDateToIsoRequired(row.updated_at_ts),
    };
  };
}
