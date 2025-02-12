import { Kysely } from "kysely";
import { Database } from "../db";
import { Session } from "@authhero/adapter-interfaces";

/**
 * Creates and returns an asynchronous function to update a session record in the database.
 *
 * The returned function updates a record in the "sessions" table by matching the provided tenant ID and
 * session ID. It constructs an updated session object by merging the provided partial session data with a
 * new ISO-formatted timestamp (added as `updated_at`), and conditionally JSON-stringifies the `device`
 * and `clients` properties if they exist.
 *
 * @param db - The Kysely database instance.
 *
 * @returns A function that accepts the following parameters:
 *   - tenant_id: A string representing the tenant identifier.
 *   - session_id: A string representing the unique session identifier.
 *   - session: A partial session object containing fields to update.
 *
 * The inner function returns a Promise that resolves to a boolean indicating whether the update modified any records.
 *
 * @example
 * const updateSession = update(db);
 * const wasUpdated = await updateSession("tenant_123", "session_456", {
 *   used_at: "2025-02-25T12:00:00.000Z",
 *   device: { os: "iOS", model: "iPhone" },
 * });
 */
export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session_id: string,
    session: Partial<Session>,
  ) => {
    const sqlSession = {
      ...session,
      updated_at: new Date().toISOString(),
      device: session.device ? JSON.stringify(session.device) : undefined,
      clients: session.clients ? JSON.stringify(session.clients) : undefined,
    };

    const results = await db
      .updateTable("sessions")
      .set(sqlSession)
      .where("tenant_id", "=", tenant_id)
      .where("sessions.id", "=", session_id)
      .execute();

    return !!results.length;
  };
}
