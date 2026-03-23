import { MfaEnrollment, MfaEnrollmentInsert } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { get } from "./get";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    enrollment_id: string,
    data: Partial<MfaEnrollmentInsert>,
  ): Promise<MfaEnrollment> => {
    const now = Date.now();

    const updateData: Record<string, unknown> = {
      updated_at_ts: now,
    };

    if (data.phone_number !== undefined) {
      updateData.phone_number = data.phone_number;
    }
    if (data.totp_secret !== undefined) {
      updateData.totp_secret = data.totp_secret;
    }
    if (data.confirmed !== undefined) {
      updateData.confirmed = data.confirmed ? 1 : 0;
    }

    await db
      .updateTable("mfa_enrollments")
      .set(updateData)
      .where("mfa_enrollments.tenant_id", "=", tenant_id)
      .where("mfa_enrollments.id", "=", enrollment_id)
      .execute();

    const result = await get(db)(tenant_id, enrollment_id);
    if (!result) {
      throw new Error(`MFA enrollment ${enrollment_id} not found`);
    }

    return result;
  };
}
