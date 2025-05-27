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

    // Parse JSON columns or stringified JSON for nodes, start, ending
    const parsed = { ...result };
    if (typeof parsed.nodes === "string") {
      try {
        parsed.nodes = JSON.parse(parsed.nodes);
      } catch {}
    }
    if (typeof parsed.start === "string") {
      try {
        parsed.start = JSON.parse(parsed.start);
      } catch {}
    }
    if (typeof parsed.ending === "string") {
      try {
        parsed.ending = JSON.parse(parsed.ending);
      } catch {}
    }
    return formSchema.parse(removeNullProperties(parsed));
  };
}
