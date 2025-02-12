import { Kysely } from "kysely";
import { Database } from "../db";

/**
 * Deletes a session record from the "sessions" table that matches the provided tenant and session IDs.
 *
 * This function returns an asynchronous function that performs a hard delete by removing the session
 * record completely from the database. It deletes the record where the tenant ID matches the provided
 * tenant_id and the session's ID (stored as "sessions.id") matches the provided session_id.
 *
 * @param db - A Kysely database instance used for executing the deletion.
 * @returns An asynchronous function that accepts a tenant_id and session_id, and returns a Promise
 *          resolving to a boolean, indicating whether any records were deleted.
 *
 * @example
 * const deleteSession = remove(db);
 * const success = await deleteSession("tenant123", "session456");
 * console.log(success ? "Session deleted." : "No matching session found.");
 */
export function remove(db: Kysely<Database>) {
  return async (tenant_id: string, session_id: string): Promise<boolean> => {
    const results = await db
      .deleteFrom("sessions")
      .where("tenant_id", "=", tenant_id)
      .where("sessions.id", "=", session_id)
      .execute();

    return !!results.length;
  };
}
