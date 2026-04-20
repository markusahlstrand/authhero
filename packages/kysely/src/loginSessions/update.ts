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

    // When authParams is updated, also merge it into the auth_params JSON blob
    // so the blob stays in sync with the hoisted authParams_* columns that
    // flattenObject() below writes. Pre-backfill rows (no blob yet) keep the
    // blob NULL and continue to read via the hoisted-columns fallback in get.
    let authParamsBlobSet: Record<string, unknown> = {};
    if (rest.authParams !== undefined) {
      const existing = await db
        .selectFrom("login_sessions")
        .where("login_sessions.id", "=", login_id)
        .where("login_sessions.tenant_id", "=", tenant_id)
        .select(["auth_params" as any])
        .executeTakeFirst();
      const existingBlob = (existing as { auth_params?: string | null } | undefined)
        ?.auth_params;
      if (typeof existingBlob === "string" && existingBlob.length > 0) {
        const parsed = JSON.parse(existingBlob);
        authParamsBlobSet = {
          auth_params: JSON.stringify({ ...parsed, ...rest.authParams }),
        };
      }
    }

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
        ...authParamsBlobSet,
        updated_at_ts: Date.now(),
        // Only update expires_at_ts if a new expires_at was provided
        // Use !== undefined to preserve null values (which mean "doesn't expire")
        ...(expires_at !== undefined
          ? { expires_at_ts: isoToDbDate(expires_at) }
          : {}),
      })
      .where("login_sessions.id", "=", login_id)
      .where("login_sessions.tenant_id", "=", tenant_id)
      .execute();

    return results.length === 1;
  };
}
