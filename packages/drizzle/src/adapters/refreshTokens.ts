import {
  eq,
  and,
  lt,
  isNull,
  count as countFn,
  asc,
  desc,
  sql,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  RefreshToken,
  ListParams,
  UpdateRefreshTokenOptions,
} from "@authhero/adapter-interfaces";
import { refreshTokens, loginSessions } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { convertDatesToAdapter, isoToDbDate } from "../helpers/dates";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function sqlToRefreshToken(row: any): RefreshToken {
  const {
    tenant_id: _,
    created_at_ts,
    expires_at_ts,
    idle_expires_at_ts,
    last_exchanged_at_ts,
    revoked_at_ts,
    device,
    resource_servers,
    rotating,
    ...rest
  } = row;

  const dates = convertDatesToAdapter(
    {
      created_at_ts,
      expires_at_ts,
      idle_expires_at_ts,
      last_exchanged_at_ts,
      revoked_at_ts,
    },
    ["created_at_ts"],
    [
      "expires_at_ts",
      "idle_expires_at_ts",
      "last_exchanged_at_ts",
      "revoked_at_ts",
    ],
  );

  return removeNullProperties({
    ...rest,
    ...dates,
    rotating: !!rotating,
    device: parseJsonIfString(device, {}),
    resource_servers: parseJsonIfString(resource_servers, []),
  });
}

function maxExpiry(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  return Math.max(a ?? 0, b ?? 0);
}

export function createRefreshTokensAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, token: any): Promise<RefreshToken> {
      const now = Date.now();

      const values = {
        id: token.id || nanoid(),
        tenant_id,
        client_id: token.client_id,
        login_id: token.login_id,
        user_id: token.user_id,
        device: JSON.stringify(token.device || {}),
        resource_servers: JSON.stringify(token.resource_servers || []),
        rotating: token.rotating ?? false,
        created_at_ts: now,
        expires_at_ts: isoToDbDate(token.expires_at),
        idle_expires_at_ts: isoToDbDate(token.idle_expires_at),
        last_exchanged_at_ts: isoToDbDate(token.last_exchanged_at),
      };

      // Use manual BEGIN/COMMIT/ROLLBACK because Drizzle's built-in
      // db.transaction() doesn't support async callbacks with better-sqlite3.
      // TODO: switch to db.batch() in a follow-up PR — interactive
      // BEGIN/COMMIT does not provide atomicity on D1 (async driver).
      await db.run(sql`BEGIN`);
      try {
        await db.insert(refreshTokens).values(values);

        const newLoginSessionExpiry = maxExpiry(
          values.expires_at_ts,
          values.idle_expires_at_ts,
        );
        if (newLoginSessionExpiry > 0 && values.login_id) {
          await db
            .update(loginSessions)
            .set({
              expires_at_ts: newLoginSessionExpiry,
              updated_at_ts: now,
            })
            .where(
              and(
                eq(loginSessions.tenant_id, tenant_id),
                eq(loginSessions.id, values.login_id),
                lt(loginSessions.expires_at_ts, newLoginSessionExpiry),
              ),
            );
        }

        await db.run(sql`COMMIT`);
      } catch (err) {
        await db.run(sql`ROLLBACK`);
        throw err;
      }

      return sqlToRefreshToken({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<RefreshToken | null> {
      const result = await db
        .select()
        .from(refreshTokens)
        .where(
          and(eq(refreshTokens.tenant_id, tenant_id), eq(refreshTokens.id, id)),
        )
        .get();

      if (!result) return null;
      return sqlToRefreshToken(result);
    },

    async update(
      tenant_id: string,
      id: string,
      token: Partial<RefreshToken>,
      options?: UpdateRefreshTokenOptions,
    ): Promise<boolean> {
      const updateData: any = {};

      if (token.device !== undefined)
        updateData.device = JSON.stringify(token.device);
      if (token.resource_servers !== undefined)
        updateData.resource_servers = JSON.stringify(token.resource_servers);
      if (token.rotating !== undefined) updateData.rotating = token.rotating;
      if (token.expires_at !== undefined)
        updateData.expires_at_ts = isoToDbDate(token.expires_at);
      if (token.idle_expires_at !== undefined)
        updateData.idle_expires_at_ts = isoToDbDate(token.idle_expires_at);
      if (token.last_exchanged_at !== undefined)
        updateData.last_exchanged_at_ts = isoToDbDate(token.last_exchanged_at);
      if (token.revoked_at !== undefined)
        updateData.revoked_at_ts = isoToDbDate(token.revoked_at);

      const bump = options?.loginSessionBump;
      const newLoginSessionExpiry = bump ? isoToDbDate(bump.expires_at) : null;

      // The login_session bump is idempotent (WHERE expires_at_ts < new) and
      // self-healing (next refresh re-bumps on transient failure) so we don't
      // wrap this in a transaction. Avoids a triple round-trip on async
      // drivers (D1/PlanetScale) and eliminates the hot-row lock window on
      // login_sessions when multiple refresh tokens share a login_id.
      const [results] = await Promise.all([
        db
          .update(refreshTokens)
          .set(updateData)
          .where(
            and(
              eq(refreshTokens.tenant_id, tenant_id),
              eq(refreshTokens.id, id),
            ),
          )
          .returning(),
        bump && newLoginSessionExpiry && newLoginSessionExpiry > 0
          ? db
              .update(loginSessions)
              .set({
                expires_at_ts: newLoginSessionExpiry,
                updated_at_ts: Date.now(),
              })
              .where(
                and(
                  eq(loginSessions.tenant_id, tenant_id),
                  eq(loginSessions.id, bump.login_id),
                  lt(loginSessions.expires_at_ts, newLoginSessionExpiry),
                ),
              )
          : Promise.resolve(),
      ]);

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      let query = db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tenant_id, tenant_id))
        .$dynamic();

      if (q) {
        const filter = buildLuceneFilter(refreshTokens, q, ["user_id"]);
        if (filter)
          query = query.where(
            and(eq(refreshTokens.tenant_id, tenant_id), filter),
          );
      }

      if (sort?.sort_by) {
        const col = (refreshTokens as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToRefreshToken);

      if (!include_totals) {
        return { refresh_tokens: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(refreshTokens)
        .where(eq(refreshTokens.tenant_id, tenant_id));

      return {
        refresh_tokens: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(refreshTokens)
        .where(
          and(eq(refreshTokens.tenant_id, tenant_id), eq(refreshTokens.id, id)),
        )
        .returning();

      return results.length > 0;
    },

    async revokeByLoginSession(
      tenant_id: string,
      login_session_id: string,
      revoked_at: string,
    ): Promise<number> {
      const results = await db
        .update(refreshTokens)
        .set({ revoked_at_ts: isoToDbDate(revoked_at) })
        .where(
          and(
            eq(refreshTokens.tenant_id, tenant_id),
            eq(refreshTokens.login_id, login_session_id),
            isNull(refreshTokens.revoked_at_ts),
          ),
        )
        .returning();

      return results.length;
    },
  };
}
