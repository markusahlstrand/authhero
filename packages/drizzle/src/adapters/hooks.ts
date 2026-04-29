import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import type { Hook, ListParams } from "@authhero/adapter-interfaces";
import { hooks } from "../schema/sqlite";
import { removeNullProperties } from "../helpers/transform";
import { convertDatesToAdapter } from "../helpers/dates";
import { buildLuceneFilter } from "../helpers/filter";
import type { DrizzleDb } from "./types";

function generateHookId(): string {
  const { customAlphabet } = require("nanoid");
  const generate = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);
  return `h_${generate()}`;
}

/**
 * Parse a JSON metadata blob from the database. Returns the value only if
 * it's a plain object — arrays, primitives, and parse errors all collapse
 * to undefined so corruption or legacy rows don't crash hook retrieval.
 */
function parseMetadata(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function sqlToHook(row: any): Hook {
  const { tenant_id: _, created_at_ts, updated_at_ts, metadata, ...rest } = row;

  const dates = convertDatesToAdapter({ created_at_ts, updated_at_ts }, [
    "created_at_ts",
    "updated_at_ts",
  ]);

  return removeNullProperties({
    ...rest,
    enabled: !!rest.enabled,
    synchronous: !!rest.synchronous,
    metadata: parseMetadata(metadata),
    ...dates,
  });
}

export function createHooksAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, hook: any): Promise<Hook> {
      const now = Date.now();
      const hook_id = hook.hook_id || generateHookId();

      const values = {
        hook_id,
        tenant_id,
        trigger_id: hook.trigger_id,
        url: hook.url,
        enabled: hook.enabled ?? true,
        synchronous: hook.synchronous ?? false,
        priority: hook.priority,
        form_id: hook.form_id,
        template_id: hook.template_id,
        code_id: hook.code_id,
        metadata: hook.metadata ? JSON.stringify(hook.metadata) : null,
        created_at_ts: now,
        updated_at_ts: now,
      };

      await db.insert(hooks).values(values);

      return sqlToHook({ ...values, tenant_id });
    },

    async get(tenant_id: string, hook_id: string): Promise<Hook | null> {
      const result = await db
        .select()
        .from(hooks)
        .where(and(eq(hooks.tenant_id, tenant_id), eq(hooks.hook_id, hook_id)))
        .get();

      if (!result) return null;
      return sqlToHook(result);
    },

    async update(
      tenant_id: string,
      hook_id: string,
      params: any,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at_ts: Date.now(),
      };

      if (params.trigger_id !== undefined)
        updateData.trigger_id = params.trigger_id;
      if (params.url !== undefined) updateData.url = params.url;
      if (params.enabled !== undefined) updateData.enabled = params.enabled;
      if (params.synchronous !== undefined)
        updateData.synchronous = params.synchronous;
      if (params.priority !== undefined) updateData.priority = params.priority;
      if (params.form_id !== undefined) updateData.form_id = params.form_id;
      if (params.template_id !== undefined)
        updateData.template_id = params.template_id;
      if (params.code_id !== undefined) updateData.code_id = params.code_id;
      if (params.metadata !== undefined)
        updateData.metadata =
          params.metadata === null ? null : JSON.stringify(params.metadata);

      const results = await db
        .update(hooks)
        .set(updateData)
        .where(and(eq(hooks.tenant_id, tenant_id), eq(hooks.hook_id, hook_id)))
        .returning();

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

      const luceneFilter = q
        ? buildLuceneFilter(hooks, q, [
            "url",
            "form_id",
            "template_id",
            "code_id",
          ])
        : undefined;

      const whereClause = luceneFilter
        ? and(eq(hooks.tenant_id, tenant_id), luceneFilter)
        : eq(hooks.tenant_id, tenant_id);

      let query = db.select().from(hooks).where(whereClause).$dynamic();

      if (sort?.sort_by) {
        const col = (hooks as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map(sqlToHook);

      if (!include_totals) {
        return { hooks: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(hooks)
        .where(whereClause);

      return {
        hooks: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, hook_id: string): Promise<boolean> {
      const results = await db
        .delete(hooks)
        .where(and(eq(hooks.tenant_id, tenant_id), eq(hooks.hook_id, hook_id)))
        .returning();

      return results.length > 0;
    },
  };
}
