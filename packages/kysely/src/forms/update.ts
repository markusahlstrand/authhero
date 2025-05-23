import { Kysely } from "kysely";
import { FormInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

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
    if (form.fields) {
      updateValues.fields = JSON.stringify(form.fields);
    }

    if (form.controls) {
      updateValues.controls = JSON.stringify(form.controls);
    }

    if (form.layout) {
      updateValues.layout = JSON.stringify(form.layout);
    }

    const { numUpdatedRows } = await db
      .updateTable("forms")
      .set(updateValues)
      .where("id", "=", form_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    return numUpdatedRows > 0;
  };
}
