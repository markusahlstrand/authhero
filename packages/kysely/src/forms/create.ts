import { nanoid } from "nanoid";
import { Kysely } from "kysely";
import {
  CreateOptions,
  Form,
  FormInsert,
  formSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: FormInsert,
    options?: CreateOptions,
  ): Promise<Form> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const form = formSchema.parse({
      id: importMetadata?.id ?? nanoid(),
      ...params,
      created_at: importMetadata?.created_at ?? now,
      updated_at: importMetadata?.updated_at ?? now,
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
