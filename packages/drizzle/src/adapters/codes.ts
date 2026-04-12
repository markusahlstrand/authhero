import { eq, and, isNull, count as countFn, asc, desc } from "drizzle-orm";
import type { Code, ListParams } from "@authhero/adapter-interfaces";
import { codes } from "../schema/sqlite";
import { removeNullProperties } from "../helpers/transform";
import type { DrizzleDb } from "./types";

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
      let query = db
        .select()
        .from(codes)
        .where(and(eq(codes.code_id, code_id), eq(codes.code_type, code_type)))
        .$dynamic();

      // tenant_id is optional in some cases
      if (tenant_id && tenant_id.length > 0) {
        query = query.where(eq(codes.tenant_id, tenant_id));
      }

      const result = await query.get();

      if (!result) return null;
      return sqlToCode(result);
    },

    async list(tenant_id: string, params?: ListParams) {
      const {
        page = 0,
        per_page = 50,
        include_totals = false,
        sort,
      } = params || {};

      let query = db
        .select()
        .from(codes)
        .where(eq(codes.tenant_id, tenant_id))
        .$dynamic();

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
        .where(eq(codes.tenant_id, tenant_id));

      return {
        codes: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async used(tenant_id: string, code_id: string): Promise<boolean> {
      await db
        .update(codes)
        .set({ used_at: new Date().toISOString() })
        .where(and(eq(codes.tenant_id, tenant_id), eq(codes.code_id, code_id)));

      return true;
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
  };
}
