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
    // and pull authParams out before flattening so we don't emit legacy
    // `authParams_*` columns — the JSON blob is the sole storage path.
    const {
      created_at,
      updated_at,
      expires_at,
      authParams,
      ...rest
    } = login;

    // When authParams is being updated, merge it into the existing blob so
    // partial updates (e.g. `{ authParams: { username } }`) don't wipe sibling
    // fields. Post-backfill every row has a blob; the `typeof` guard is a
    // defensive no-op for the pathological case of a row the migration
    // didn't touch.
    let authParamsBlobSet: Record<string, unknown> = {};
    if (authParams !== undefined) {
      const existing = await db
        .selectFrom("login_sessions")
        .where("login_sessions.id", "=", login_id)
        .where("login_sessions.tenant_id", "=", tenant_id)
        .select(["auth_params"])
        .executeTakeFirst();
      const existingBlob = existing?.auth_params;
      const parsed: Record<string, unknown> =
        typeof existingBlob === "string" && existingBlob.length > 0
          ? JSON.parse(existingBlob)
          : {};
      authParamsBlobSet = {
        auth_params: JSON.stringify({ ...parsed, ...authParams }),
      };
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
