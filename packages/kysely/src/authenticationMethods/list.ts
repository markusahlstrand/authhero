import { AuthenticationMethod } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { dbDateToIsoRequired } from "../utils/dateConversion";

export function list(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    user_id: string,
  ): Promise<AuthenticationMethod[]> => {
    const rows = await db
      .selectFrom("authentication_methods")
      .where("authentication_methods.tenant_id", "=", tenant_id)
      .where("authentication_methods.user_id", "=", user_id)
      .selectAll()
      .execute();

    return rows.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      type: row.type as AuthenticationMethod["type"],
      phone_number: row.phone_number ?? undefined,
      totp_secret: row.totp_secret ?? undefined,
      credential_id: row.credential_id ?? undefined,
      public_key: row.public_key ?? undefined,
      sign_count: row.sign_count ?? undefined,
      credential_backed_up:
        row.credential_backed_up != null
          ? row.credential_backed_up === 1
          : undefined,
      transports: row.transports ? JSON.parse(row.transports) : undefined,
      friendly_name: row.friendly_name ?? undefined,
      confirmed: row.confirmed === 1,
      created_at: dbDateToIsoRequired(row.created_at_ts),
      updated_at: dbDateToIsoRequired(row.updated_at_ts),
    }));
  };
}
