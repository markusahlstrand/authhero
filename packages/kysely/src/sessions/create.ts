import { Kysely } from "kysely";
import { Session, SessionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

/**
 * Creates and returns an asynchronous function to insert a new session into the "sessions" table.
 *
 * The returned function accepts a tenant identifier and a session object. It constructs the session record by:
 * - Merging the provided session properties with additional attributes.
 * - Setting the `session_id` from the session's `id` (serving as a fallback until the primary key is changed).
 * - Initializing the `created_at`, `updated_at`, `authenticated_at`, and `last_interaction_at` fields with the current ISO timestamp.
 * - Serializing the `device` and `clients` fields of the session to JSON format before insertion.
 *
 * After inserting the session into the database using the provided Kysely instance, the function returns the newly created session record.
 *
 * @param db - An instance of Kysely for interacting with the database.
 * @returns A function that, when called with a tenant id and a session to insert, returns a Promise resolving to the created session.
 *
 * @example
 * const createSession = create(db);
 * const newSession = await createSession("tenant123", {
 *   id: "session_1",
 *   device: { type: "mobile", os: "Android" },
 *   clients: ["client1", "client2"],
 *   // Additional session properties as needed
 * });
 */
export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    session: SessionInsert,
  ): Promise<Session> => {
    const createdSession = {
      ...session,
      // fallback untill we changed primary key
      session_id: session.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      authenticated_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString(),
    };

    await db
      .insertInto("sessions")
      .values({
        ...createdSession,
        tenant_id,
        device: JSON.stringify(session.device),
        clients: JSON.stringify(session.clients),
      })
      .execute();

    return createdSession;
  };
}
