import { Kysely } from "kysely";
import { Form, formSchema } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, form_id: string): Promise<Form | null> => {
    const result = await db
      .selectFrom("forms")
      .selectAll()
      .where("forms.id", "=", form_id)
      .where("tenant_id", "=", tenant_id)
      .executeTakeFirst();

    if (!result) return null;

    // Parse JSON strings back to objects
    return formSchema.parse(
      removeNullProperties({
        ...result,
        fields: JSON.parse(result.fields as string),
        controls: result.controls
          ? JSON.parse(result.controls as string)
          : undefined,
        layout: result.layout ? JSON.parse(result.layout as string) : undefined,
        active: result.active === 1,
      }),
    );
  };
}
