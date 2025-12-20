import { Kysely } from "kysely";
import { FlowInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    flow_id: string,
    flow: Partial<FlowInsert>,
  ): Promise<boolean> => {
    // Prepare the update object, converting complex types to JSON strings
    const updateData: Record<string, unknown> = {
      ...flow,
      updated_at: new Date().toISOString(),
    };

    // Serialize complex fields to JSON strings if present
    if (flow.actions !== undefined) {
      updateData.actions = JSON.stringify(flow.actions);
    }

    const result = await db
      .updateTable("flows")
      .set(updateData)
      .where("id", "=", flow_id)
      .where("tenant_id", "=", tenant_id)
      .execute();

    return (result[0]?.numUpdatedRows ?? 0n) > 0n;
  };
}
