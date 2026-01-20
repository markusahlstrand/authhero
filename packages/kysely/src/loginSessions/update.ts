import { LoginSession } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { flattenObject } from "../utils/flatten";
import { isoToDbDate } from "../utils/dateConversion";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    login_id: string,
    login: Partial<LoginSession>,
  ) => {
    // Extract date fields that need conversion (they come as ISO strings from the adapter interface)
    const { created_at, updated_at, expires_at, ...rest } = login;

    const flattened = flattenObject(rest) as Record<string, unknown>;

    // Remove any _ts fields that might have been passed through
    delete flattened.created_at_ts;
    delete flattened.updated_at_ts;
    delete flattened.expires_at_ts;
    // Also remove id and tenant_id from the update payload
    delete flattened.id;
    delete flattened.tenant_id;

    const results = await db
      .updateTable("login_sessions")
      .set({
        ...flattened,
        updated_at_ts: Date.now(),
        // Only update expires_at_ts if a new expires_at was provided
        ...(expires_at ? { expires_at_ts: isoToDbDate(expires_at) } : {}),
      })
      .where("login_sessions.id", "=", login_id)
      .where("login_sessions.tenant_id", "=", tenant_id)
      .execute();

    return results.length === 1;
  };
}
