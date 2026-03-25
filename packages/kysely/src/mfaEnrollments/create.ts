import {
  MfaEnrollment,
  MfaEnrollmentInsert,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { ulid } from "../utils/ulid";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    enrollment: MfaEnrollmentInsert,
  ): Promise<MfaEnrollment> => {
    const now = Date.now();
    const id = ulid();

    await db
      .insertInto("mfa_enrollments")
      .values({
        id,
        tenant_id,
        user_id: enrollment.user_id,
        type: enrollment.type,
        phone_number: enrollment.phone_number,
        totp_secret: enrollment.totp_secret,
        confirmed: enrollment.confirmed ? 1 : 0,
        created_at_ts: now,
        updated_at_ts: now,
      })
      .execute();

    return {
      id,
      user_id: enrollment.user_id,
      type: enrollment.type,
      phone_number: enrollment.phone_number,
      totp_secret: enrollment.totp_secret,
      confirmed: enrollment.confirmed ?? false,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  };
}
