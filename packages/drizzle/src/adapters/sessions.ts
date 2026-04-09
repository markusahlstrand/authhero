import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Session, ListParams } from "@authhero/adapter-interfaces";
import { sessions } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { convertDatesToAdapter, isoToDbDate } from "../helpers/dates";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

const REQUIRED_DATE_COLS = ["created_at_ts", "updated_at_ts"] as const;
const OPTIONAL_DATE_COLS = [
  "expires_at_ts",
  "idle_expires_at_ts",
  "authenticated_at_ts",
  "last_interaction_at_ts",
  "used_at_ts",
  "revoked_at_ts",
] as const;

function sqlToSession(row: any): Session {
  const {
    tenant_id: _,
    created_at_ts,
    updated_at_ts,
    expires_at_ts,
    idle_expires_at_ts,
    authenticated_at_ts,
    last_interaction_at_ts,
    used_at_ts,
    revoked_at_ts,
    device,
    clients: clientsJson,
    ...rest
  } = row;

  const dates = convertDatesToAdapter(
    {
      created_at_ts,
      updated_at_ts,
      expires_at_ts,
      idle_expires_at_ts,
      authenticated_at_ts,
      last_interaction_at_ts,
      used_at_ts,
      revoked_at_ts,
    },
    [...REQUIRED_DATE_COLS],
    [...OPTIONAL_DATE_COLS],
  );

  return removeNullProperties({
    ...rest,
    ...dates,
    device: parseJsonIfString(device, {}),
    clients: parseJsonIfString(clientsJson, []),
  });
}

export function createSessionsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, session: any): Promise<Session> {
      const now = Date.now();

      const values = {
        id: session.id || nanoid(),
        tenant_id,
        user_id: session.user_id,
        login_session_id: session.login_session_id,
        device: JSON.stringify(session.device || {}),
        clients: JSON.stringify(session.clients || []),
        created_at_ts: now,
        updated_at_ts: now,
        expires_at_ts: isoToDbDate(session.expires_at),
        idle_expires_at_ts: isoToDbDate(session.idle_expires_at),
        authenticated_at_ts: session.authenticated_at
          ? isoToDbDate(session.authenticated_at)
          : now,
        last_interaction_at_ts: session.last_interaction_at
          ? isoToDbDate(session.last_interaction_at)
          : now,
        used_at_ts: isoToDbDate(session.used_at),
        revoked_at_ts: isoToDbDate(session.revoked_at),
      };

      await db.insert(sessions).values(values);

      return sqlToSession({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<Session | null> {
      const result = await db
        .select()
        .from(sessions)
        .where(
          and(eq(sessions.tenant_id, tenant_id), eq(sessions.id, id)),
        )
        .get();

      if (!result) return null;
      return sqlToSession(result);
    },

    async update(
      tenant_id: string,
      id: string,
      session: Partial<Session>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at_ts: Date.now(),
      };

      if (session.user_id !== undefined) updateData.user_id = session.user_id;
      if (session.login_session_id !== undefined)
        updateData.login_session_id = session.login_session_id;
      if (session.device !== undefined)
        updateData.device = JSON.stringify(session.device);
      if (session.clients !== undefined)
        updateData.clients = JSON.stringify(session.clients);
      if (session.expires_at !== undefined)
        updateData.expires_at_ts = isoToDbDate(session.expires_at);
      if (session.idle_expires_at !== undefined)
        updateData.idle_expires_at_ts = isoToDbDate(session.idle_expires_at);
      if (session.authenticated_at !== undefined)
        updateData.authenticated_at_ts = isoToDbDate(session.authenticated_at);
      if (session.last_interaction_at !== undefined)
        updateData.last_interaction_at_ts = isoToDbDate(
          session.last_interaction_at,
        );
      if (session.used_at !== undefined)
        updateData.used_at_ts = isoToDbDate(session.used_at);
      if (session.revoked_at !== undefined)
        updateData.revoked_at_ts = isoToDbDate(session.revoked_at);

      const results = await db
        .update(sessions)
        .set(updateData)
        .where(
          and(eq(sessions.tenant_id, tenant_id), eq(sessions.id, id)),
        )
        .returning();

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort, q } =
        params || {};

      let query = db
        .select()
        .from(sessions)
        .where(eq(sessions.tenant_id, tenant_id))
        .$dynamic();

      if (q) {
        const filter = buildLuceneFilter(sessions, q, ["user_id"]);
        if (filter) query = query.where(filter);
      }

      if (sort?.sort_by) {
        const col = (sessions as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToSession);

      if (!include_totals) {
        return { sessions: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(sessions)
        .where(eq(sessions.tenant_id, tenant_id));

      return {
        sessions: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(sessions)
        .where(
          and(eq(sessions.tenant_id, tenant_id), eq(sessions.id, id)),
        )
        .returning();

      return results.length > 0;
    },
  };
}
