import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { RefreshToken, ListParams } from "@authhero/adapter-interfaces";
import { refreshTokens } from "../schema/sqlite";
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
    device,
    resource_servers,
    rotating,
    ...rest
  } = row;

  const dates = convertDatesToAdapter(
    { created_at_ts, expires_at_ts, idle_expires_at_ts, last_exchanged_at_ts },
    ["created_at_ts"],
    ["expires_at_ts", "idle_expires_at_ts", "last_exchanged_at_ts"],
  );

  return removeNullProperties({
    ...rest,
    ...dates,
    rotating: !!rotating,
    device: parseJsonIfString(device, {}),
    resource_servers: parseJsonIfString(resource_servers, []),
  });
}

export function createRefreshTokensAdapter(
  db: DrizzleDb,
) {
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

      await db.insert(refreshTokens).values(values);

      return sqlToRefreshToken({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<RefreshToken | null> {
      const result = await db
        .select()
        .from(refreshTokens)
        .where(
          and(
            eq(refreshTokens.tenant_id, tenant_id),
            eq(refreshTokens.id, id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToRefreshToken(result);
    },

    async update(
      tenant_id: string,
      id: string,
      token: Partial<RefreshToken>,
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

      const results = await db
        .update(refreshTokens)
        .set(updateData)
        .where(
          and(
            eq(refreshTokens.tenant_id, tenant_id),
            eq(refreshTokens.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort, q } =
        params || {};

      let query = db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tenant_id, tenant_id))
        .$dynamic();

      if (q) {
        const filter = buildLuceneFilter(refreshTokens, q, ["user_id"]);
        if (filter) query = query.where(filter);
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
          and(
            eq(refreshTokens.tenant_id, tenant_id),
            eq(refreshTokens.id, id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
