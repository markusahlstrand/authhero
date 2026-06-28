import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  CreateOptions,
  Flow,
  flowSchema,
  FlowInsert,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: FlowInsert,
    options?: CreateOptions,
  ): Promise<Flow> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();

    const flow = flowSchema.parse({
      id: importMetadata?.id ?? `af_${nanoid()}`,
      ...params,
      actions: params.actions || [],
      created_at: importMetadata?.created_at ?? now,
      updated_at: importMetadata?.updated_at ?? now,
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
