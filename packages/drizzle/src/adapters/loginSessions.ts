import { eq, and } from "drizzle-orm";
import type { LoginSession } from "@authhero/adapter-interfaces";
import { loginSessions } from "../schema/sqlite";
import {
  removeNullProperties,
  flattenObject,
  unflattenObject,
  parseJsonIfString,
} from "../helpers/transform";
import { convertDatesToAdapter, isoToDbDate } from "../helpers/dates";
import type { DrizzleDb } from "./types";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;

function ulid(): string {
  const TIME_LEN = 10;
  const RANDOM_LEN = 16;

  let now = Date.now();
  let str = "";
  for (let i = TIME_LEN; i > 0; i--) {
    str = ENCODING.charAt(now % ENCODING_LEN) + str;
    now = Math.floor(now / ENCODING_LEN);
  }

  const buffer = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(buffer);
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING.charAt(buffer[i]! % ENCODING_LEN);
  }

  return str;
}

function sqlToLoginSession(row: any): LoginSession {
  const {
    tenant_id: _,
    created_at_ts,
    updated_at_ts,
    expires_at_ts,
    state_data,
    ...rest
  } = row;

  const dates = convertDatesToAdapter(
    { created_at_ts, updated_at_ts, expires_at_ts },
    ["created_at_ts", "updated_at_ts", "expires_at_ts"],
  );

  const unflattened = unflattenObject(rest, ["authParams"]);

  return removeNullProperties({
    ...unflattened,
    ...dates,
    state_data: parseJsonIfString(state_data),
  });
}

export function createLoginSessionsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, session: any): Promise<LoginSession> {
      const now = Date.now();
      const id = ulid();

      const flattened = flattenObject(
        { authParams: session.authParams || {} },
        "authParams",
      );

      const values: any = {
        id,
        tenant_id,
        session_id: session.session_id,
        csrf_token: session.csrf_token,
        authorization_url: session.authorization_url
          ? session.authorization_url.substring(0, 1024)
          : undefined,
        ip: session.ip,
        useragent: session.useragent,
        auth0Client: session.auth0Client,
        state: session.state || "pending",
        state_data: session.state_data
          ? JSON.stringify(session.state_data)
          : undefined,
        failure_reason: session.failure_reason,
        user_id: session.user_id,
        auth_connection: session.auth_connection,
        created_at_ts: now,
        updated_at_ts: now,
        expires_at_ts: session.expires_at
          ? isoToDbDate(session.expires_at)
          : now + 1000 * 60 * 60 * 24,
      };

      // Add flattened authParams
      for (const [key, value] of Object.entries(flattened)) {
        values[key] = value;
      }

      await db.insert(loginSessions).values(values);

      return sqlToLoginSession({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<LoginSession | null> {
      const result = await db
        .select()
        .from(loginSessions)
        .where(
          and(
            eq(loginSessions.tenant_id, tenant_id),
            eq(loginSessions.id, id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToLoginSession(result);
    },

    async update(
      tenant_id: string,
      id: string,
      session: Partial<LoginSession>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at_ts: Date.now(),
      };

      if (session.session_id !== undefined)
        updateData.session_id = session.session_id;
      if (session.state !== undefined) updateData.state = session.state;
      if (session.state_data !== undefined)
        updateData.state_data = JSON.stringify(session.state_data);
      if (session.failure_reason !== undefined)
        updateData.failure_reason = session.failure_reason;
      if (session.user_id !== undefined) updateData.user_id = session.user_id;
      if (session.auth_connection !== undefined)
        updateData.auth_connection = session.auth_connection;
      if (session.authorization_url !== undefined)
        updateData.authorization_url = session.authorization_url?.substring(
          0,
          1024,
        );
      if (session.expires_at !== undefined)
        updateData.expires_at_ts = isoToDbDate(session.expires_at);

      // Flatten authParams if present
      if (session.authParams) {
        const flattened = flattenObject(
          { authParams: session.authParams },
          "authParams",
        );
        Object.assign(updateData, flattened);
      }

      await db
        .update(loginSessions)
        .set(updateData)
        .where(
          and(
            eq(loginSessions.tenant_id, tenant_id),
            eq(loginSessions.id, id),
          ),
        );

      return true;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(loginSessions)
        .where(
          and(
            eq(loginSessions.tenant_id, tenant_id),
            eq(loginSessions.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
