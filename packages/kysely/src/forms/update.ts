import { Kysely } from "kysely";
import { FormInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { stringifyProperties } from "../helpers/stringify";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    form_id: string,
    form: Partial<FormInsert>,
  ): Promise<boolean> => {
    const updateValues: Record<string, any> = {
      ...form,
      updated_at: new Date().toISOString(),
    };

    // Convert complex objects to JSON strings
    stringifyProperties(form, ["nodes", "start", "ending"], updateValues);

    const { numUpdatedRows } = await db
      .updateTable("forms")
      .set(updateValues)
      .where("id", "=", form_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    return numUpdatedRows > 0;
  };
}
