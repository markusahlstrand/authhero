import { eq, and } from "drizzle-orm";
import type { LoginSession } from "@authhero/adapter-interfaces";
import { loginSessions } from "../schema/sqlite";
import {
  removeNullProperties,
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
    auth_params,
    ...rest
  } = row;

  const dates = convertDatesToAdapter(
    { created_at_ts, updated_at_ts, expires_at_ts },
    ["created_at_ts", "updated_at_ts", "expires_at_ts"],
  );

  // Prune null/undefined hoisted columns before unflattening so that e.g.
  // auth_strategy_* being NULL doesn't produce a bogus empty auth_strategy
  // object after unflatten.
  const restPruned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== null && value !== undefined) {
      restPruned[key] = value;
    }
  }

  const unflattened = unflattenObject(restPruned, ["auth_strategy"]);

  return removeNullProperties({
    ...unflattened,
    authParams:
      typeof auth_params === "string" && auth_params.length > 0
        ? JSON.parse(auth_params)
        : {},
    ...dates,
    state_data: parseJsonIfString(state_data),
  });
}

export function createLoginSessionsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, session: any): Promise<LoginSession> {
      const now = Date.now();
      const id = ulid();

      const values: any = {
        id,
        tenant_id,
        session_id: session.session_id,
        csrf_token: session.csrf_token,
        auth_params: JSON.stringify(session.authParams || {}),
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
        auth_strategy_strategy: session.auth_strategy?.strategy,
        auth_strategy_strategy_type: session.auth_strategy?.strategy_type,
        authenticated_at: session.authenticated_at,
        created_at_ts: now,
        updated_at_ts: now,
        expires_at_ts: session.expires_at
          ? isoToDbDate(session.expires_at)
          : now + 1000 * 60 * 60 * 24,
      };

      await db.insert(loginSessions).values(values);

      return sqlToLoginSession({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<LoginSession | null> {
      // /authorize/resume calls get() before the tenant is known, so accept
      // an empty tenant_id and look up by id alone in that case.
      const where = tenant_id
        ? and(eq(loginSessions.tenant_id, tenant_id), eq(loginSessions.id, id))
        : eq(loginSessions.id, id);

      const result = await db.select().from(loginSessions).where(where).get();

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
      if (session.auth_strategy !== undefined) {
        updateData.auth_strategy_strategy = session.auth_strategy?.strategy;
        updateData.auth_strategy_strategy_type =
          session.auth_strategy?.strategy_type;
      }
      if (session.authenticated_at !== undefined)
        updateData.authenticated_at = session.authenticated_at;
      if (session.authorization_url !== undefined)
        updateData.authorization_url = session.authorization_url?.substring(
          0,
          1024,
        );
      if (session.expires_at !== undefined)
        updateData.expires_at_ts = isoToDbDate(session.expires_at);

      // Merge authParams into the existing JSON blob so partial updates
      // (e.g. `{ authParams: { username } }`) don't wipe sibling fields.
      if (session.authParams !== undefined) {
        const existing = await db
          .select({ auth_params: loginSessions.auth_params })
          .from(loginSessions)
          .where(
            and(
              eq(loginSessions.tenant_id, tenant_id),
              eq(loginSessions.id, id),
            ),
          )
          .get();
        const parsed: Record<string, unknown> =
          existing?.auth_params &&
          typeof existing.auth_params === "string" &&
          existing.auth_params.length > 0
            ? JSON.parse(existing.auth_params)
            : {};
        updateData.auth_params = JSON.stringify({
          ...parsed,
          ...session.authParams,
        });
      }

      await db
        .update(loginSessions)
        .set(updateData)
        .where(
          and(eq(loginSessions.tenant_id, tenant_id), eq(loginSessions.id, id)),
        );

      return true;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(loginSessions)
        .where(
          and(eq(loginSessions.tenant_id, tenant_id), eq(loginSessions.id, id)),
        )
        .returning();

      return results.length > 0;
    },
  };
}
