import { Kysely } from "kysely";
import { Flow, FlowInsert, flowSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    flow_id: string,
    flow: Partial<FlowInsert>,
  ): Promise<Flow | null> => {
    // Prepare the update object, converting complex types to JSON strings
    const updateData: Record<string, unknown> = {
      ...flow,
      updated_at: new Date().toISOString(),
    };

    // Serialize complex fields to JSON strings if present
    if (flow.actions !== undefined) {
      updateData.actions = JSON.stringify(flow.actions);
    }

    const { numUpdatedRows } = await db
      .updateTable("flows")
      .set(updateData)
      .where("id", "=", flow_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (numUpdatedRows === 0n) return null;

    // Fetch the updated flow
    const result = await db
      .selectFrom("flows")
      .selectAll()
      .where("id", "=", flow_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (!result) return null;

    return flowSchema.parse({
      ...result,
      actions: result.actions ? JSON.parse(result.actions) : [],
    });
  };
}
