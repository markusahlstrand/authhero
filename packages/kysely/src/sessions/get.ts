import { Session } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

/**
 * Creates a session retrieval function using the provided Kysely database instance.
 *
 * This function returns an asynchronous function that retrieves a session from the "sessions" table
 * for the specified tenant and session ID. The query filters sessions by a matching tenant ID,
 * session ID, and ensures that the session has not been revoked (i.e., `revoked_at` is null).
 *
 * If a matching session is found, the function removes the `tenant_id` property, parses the `device`
 * and `clients` JSON strings into objects, and returns a new session object. The final session `id` is
 * determined using either the `id` or `session_id` field from the retrieved record.
 *
 * @param db - The Kysely database instance used to execute the query.
 * @returns An asynchronous function that takes a tenant ID and session ID, and returns a Promise that
 * resolves to a session object with parsed properties or null if no matching session is found.
 *
 * @example
 * const getSession = get(db);
 * const session = await getSession("tenant123", "session456");
 * if (session) {
 *   console.log("Session found:", session);
 * } else {
 *   console.log("Session not found.");
 * }
 */
export function get(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<Session | null> => {
    const session = await db
      .selectFrom("sessions")
      .where("sessions.tenant_id", "=", tenant_id)
      .where("sessions.id", "=", id)
      .where("sessions.revoked_at", "is", null)
      .selectAll()
      .executeTakeFirst();

    if (!session) {
      return null;
    }

    const { tenant_id: _, device, clients, ...rest } = session;

    const idWithfallback = rest.id || rest.session_id || "";

    return {
      ...rest,
      id: idWithfallback,
      device: JSON.parse(device),
      clients: JSON.parse(clients),
    };
  };
}
