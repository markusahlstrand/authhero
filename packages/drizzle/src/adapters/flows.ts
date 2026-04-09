import { eq, and, count as countFn, asc, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { Flow, ListParams } from "@authhero/adapter-interfaces";
import { flows } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import type { DrizzleDb } from "./types";

export function createFlowsAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, params: any): Promise<Flow> {
      const now = new Date().toISOString();
      const id = `af_${nanoid()}`;

      await db.insert(flows).values({
        id,
        tenant_id,
        name: params.name,
        actions: JSON.stringify(params.actions || []),
        created_at: now,
        updated_at: now,
      });

      return {
        id,
        name: params.name,
        actions: params.actions || [],
        created_at: now,
        updated_at: now,
      };
    },

    async get(tenant_id: string, flow_id: string): Promise<Flow | null> {
      const result = await db
        .select()
        .from(flows)
        .where(and(eq(flows.tenant_id, tenant_id), eq(flows.id, flow_id)))
        .get();

      if (!result) return null;

      const { tenant_id: _, actions, ...rest } = result;
      return removeNullProperties({
        ...rest,
        actions: parseJsonIfString(actions, []),
      });
    },

    async update(
      tenant_id: string,
      flow_id: string,
      params: Partial<Flow>,
    ): Promise<Flow | null> {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (params.name !== undefined) updateData.name = params.name;
      if (params.actions !== undefined)
        updateData.actions = JSON.stringify(params.actions);

      const results = await db
        .update(flows)
        .set(updateData)
        .where(and(eq(flows.tenant_id, tenant_id), eq(flows.id, flow_id)))
        .returning();

      if (results.length === 0) return null;

      // Fetch updated
      return this.get(tenant_id, flow_id);
    },

    async list(tenant_id: string, params?: ListParams) {
      const { page = 0, per_page = 50, include_totals = false, sort } =
        params || {};

      let query = db
        .select()
        .from(flows)
        .where(eq(flows.tenant_id, tenant_id))
        .$dynamic();

      if (sort?.sort_by) {
        const col = (flows as any)[sort.sort_by];
        if (col) {
          query = query.orderBy(
            sort.sort_order === "desc" ? desc(col) : asc(col),
          );
        }
      }

      const results = await query.offset(page * per_page).limit(per_page);
      const mapped = results.map((row) => {
        const { tenant_id: _, actions, ...rest } = row;
        return removeNullProperties({
          ...rest,
          actions: parseJsonIfString(actions, []),
        });
      });

      if (!include_totals) {
        return { flows: mapped };
      }

      const [countResult] = await db
        .select({ count: countFn() })
        .from(flows)
        .where(eq(flows.tenant_id, tenant_id));

      return {
        flows: mapped,
        start: page * per_page,
        limit: per_page,
        length: Number(countResult?.count ?? 0),
      };
    },

    async remove(tenant_id: string, flow_id: string): Promise<boolean> {
      const results = await db
        .delete(flows)
        .where(and(eq(flows.tenant_id, tenant_id), eq(flows.id, flow_id)))
        .returning();

      return results.length > 0;
    },
  };
}
