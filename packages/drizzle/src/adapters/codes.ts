import { eq, and, isNull, lt, count as countFn, asc, desc } from "drizzle-orm";
import type { Code, ListParams } from "@authhero/adapter-interfaces";
import { codes } from "../schema/sqlite";
import { removeNullProperties } from "../helpers/transform";
import { buildLuceneFilter, sanitizeLuceneQuery } from "../helpers/filter";
import type { DrizzleDb } from "./types";

// Fields codes.list() accepts in `q`. Excludes `tenant_id`.
const ALLOWED_Q_FIELDS = ["code_id", "login_id"];

function sqlToCode(row: any): Code {
  const { tenant_id: _, ...rest } = row;
  return removeNullProperties(rest);
}

export function createCodesAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, code: any): Promise<Code> {
      const values = {
        ...code,
        tenant_id,
        created_at: code.created_at || new Date().toISOString(),
        expires_at: code.expires_at,
      };

      await db.insert(codes).values(values);

      return sqlToCode(values);
    },

    async get(
      tenant_id: string,
      code_id: string,
      code_type: string,
    ): Promise<Code | null> {
      // /callback and /authorize/resume call get() before the tenant is
      // known, so accept an empty tenant_id and look up by code alone in
      // that case — same contract as loginSessions.get.
      const where = tenant_id
        ? and(
            eq(codes.tenant_id, tenant_id),
            eq(codes.code_id, code_id),
            eq(codes.code_type, code_type),
          )
        : and(eq(codes.code_id, code_id), eq(codes.code_type, code_type));

      const result = await db.select().from(codes).where(where).get();

      if (!result) return null;
      return sqlToCode(result);
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
        q,
      } = params || {};

      const conditions = [eq(codes.tenant_id, tenant_id)];
      if (q) {
        // Sanitize first so only whitelisted fields reach buildLuceneFilter;
        // otherwise a clause like `q=tenant_id:other` would emit SQL against
        // arbitrary columns.
        const sanitized = sanitizeLuceneQuery(q, ALLOWED_Q_FIELDS);
        if (sanitized) {
          const filter = buildLuceneFilter(codes, sanitized, ALLOWED_Q_FIELDS);
          if (filter) conditions.push(filter);
        }
      }
      const whereClause = and(...conditions);

      let query = db.select().from(codes).where(whereClause).$dynamic();

      if (sort?.sort_by) {
        const col = (codes as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToCode);

      if (!include_totals) {
        return { codes: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(codes)
        .where(whereClause);

      return {
        codes: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async used(tenant_id: string, code_id: string): Promise<boolean> {
      const results = await db
        .update(codes)
        .set({ used_at: new Date().toISOString() })
        .where(and(eq(codes.tenant_id, tenant_id), eq(codes.code_id, code_id)))
        .returning();

      return results.length > 0;
    },

    async consume(tenant_id: string, code_id: string): Promise<boolean> {
      // Atomic: only update if used_at is null (prevents double-consumption)
      const results = await db
        .update(codes)
        .set({ used_at: new Date().toISOString() })
        .where(
          and(
            eq(codes.tenant_id, tenant_id),
            eq(codes.code_id, code_id),
            isNull(codes.used_at),
          ),
        )
        .returning();

      return results.length > 0;
    },

    async remove(tenant_id: string, code_id: string): Promise<boolean> {
      const results = await db
        .delete(codes)
        .where(and(eq(codes.tenant_id, tenant_id), eq(codes.code_id, code_id)))
        .returning();

      return results.length > 0;
    },

    async cleanup(olderThan: string): Promise<number> {
      // `expires_at` is an ISO-8601 text column with its own index
      // (`codes_expires_at_index`), and ISO-8601 compares lexicographically in
      // chronological order — so this is an indexed range scan as-is. Unlike
      // kysely, drizzle needs no numeric twin column here.
      const results = await db
        .delete(codes)
        .where(lt(codes.expires_at, olderThan))
        // Project a single column rather than whole rows: this can delete a
        // large backlog on its first run.
        .returning({ code_id: codes.code_id });

      return results.length;
    },
  };
}
