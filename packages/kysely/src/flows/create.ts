import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Flow, flowSchema, FlowInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, params: FlowInsert): Promise<Flow> => {
    const now = new Date().toISOString();

    const flow = flowSchema.parse({
      id: `af_${nanoid()}`,
      ...params,
      actions: params.actions || [],
      created_at: now,
      updated_at: now,
    });

    await db
      .insertInto("flows")
      .values({
        ...flow,
        tenant_id,
        // Serialize complex objects to JSON strings
        actions: JSON.stringify(flow.actions),
      })
      .execute();

    return flow;
  };
}
