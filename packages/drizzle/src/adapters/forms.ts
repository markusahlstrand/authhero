import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Form, ListParams } from "@authhero/adapter-interfaces";
import { forms } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

const JSON_FIELDS = ["nodes", "start", "ending"] as const;

export function createFormsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<Form> {
      const now = new Date().toISOString();
      const id = nanoid();

      const values: any = {
        id,
        tenant_id,
        name: params.name,
        messages: params.messages,
        languages: params.languages,
        translations: params.translations,
        style: params.style,
        created_at: now,
        updated_at: now,
      };

      for (const field of JSON_FIELDS) {
        values[field] = JSON.stringify(params[field] || (field === "nodes" ? [] : {}));
      }

      await db.insert(forms).values(values);

      return {
        id,
        ...params,
        created_at: now,
        updated_at: now,
      };
    },

    async get(tenant_id: string, form_id: string): Promise<Form | null> {
      const result = await db
        .select()
        .from(forms)
        .where(and(eq(forms.tenant_id, tenant_id), eq(forms.id, form_id)))
        .get();

      if (!result) return null;

      const { tenant_id: _, ...rest } = result;
      const parsed: any = { ...rest };
      for (const field of JSON_FIELDS) {
        parsed[field] = parseJsonIfString(rest[field] as string);
      }
      return removeNullProperties(parsed);
    },

    async update(
      tenant_id: string,
      form_id: string,
      params: Partial<Form>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          if (JSON_FIELDS.includes(key as any)) {
            updateData[key] = JSON.stringify(value);
          } else {
            updateData[key] = value;
          }
        }
      }

      const results = await db
        .update(forms)
        .set(updateData)
        .where(and(eq(forms.tenant_id, tenant_id), eq(forms.id, form_id)))
        .returning();

      return results.length > 0;
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort } =
        params || {};

      let query = db
        .select()
        .from(forms)
        .where(eq(forms.tenant_id, tenant_id))
        .$dynamic();

      if (sort?.sort_by) {
        const col = (forms as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map((row) => {
        const { tenant_id: _, ...rest } = row;
        const parsed: any = { ...rest };
        for (const field of JSON_FIELDS) {
          parsed[field] = parseJsonIfString(rest[field] as string);
        }
        return removeNullProperties(parsed);
      });

      if (!include_totals) {
        return { forms: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(forms)
        .where(eq(forms.tenant_id, tenant_id));

      return {
        forms: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, form_id: string): Promise<boolean> {
      const results = await db
        .delete(forms)
        .where(and(eq(forms.tenant_id, tenant_id), eq(forms.id, form_id)))
        .returning();

      return results.length > 0;
    },
  };
}
