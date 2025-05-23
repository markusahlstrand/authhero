import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import { Form, FormInsert, formSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, params: FormInsert): Promise<Form> => {
    const form = formSchema.parse({
      id: nanoid(),
      ...params,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await db
      .insertInto("forms")
      .values({
        ...form,
        // Store complex objects as JSON strings
        fields: JSON.stringify(form.fields || []),
        controls: JSON.stringify(form.controls || []),
        layout: JSON.stringify(form.layout || {}),
        tenant_id,
        active: form.active ? 1 : 0,
      })
      .execute();

    return formSchema.parse(form);
  };
}
