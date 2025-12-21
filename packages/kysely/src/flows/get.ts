import { Kysely } from "kysely";
import { Flow, flowSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";
import { parseJsonIfDefined } from "../helpers/parse";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, flow_id: string): Promise<Flow | null> => {
    const result = await db
      .selectFrom("flows")
      .selectAll()
      .where("flows.id", "=", flow_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (!result) return null;

    // Parse JSON columns and construct final object
    const flow = {
      ...result,
      actions: parseJsonIfDefined(result.actions, []),
    };

    return flowSchema.parse(removeNullProperties(flow));
  };
}
