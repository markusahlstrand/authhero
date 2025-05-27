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
        nodes: JSON.stringify(form.nodes || []),
        start: JSON.stringify(form.start || {}),
        ending: JSON.stringify(form.ending || {}),
        tenant_id,
      })
      .execute();

    return formSchema.parse(form);
  };
}
