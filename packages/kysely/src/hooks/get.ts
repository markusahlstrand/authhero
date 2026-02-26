import { Kysely } from "kysely";
import { removeNullProperties } from "../helpers/remove-nulls";
import { Hook } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { convertDatesToAdapter } from "../utils/dateConversion";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, hook_id: string): Promise<Hook | null> => {
    const hook = await db
      .selectFrom("hooks")
      .where("hooks.tenant_id", "=", tenant_id)
      .where("hooks.hook_id", "=", hook_id)
      .selectAll()
      .executeTakeFirst();

    if (!hook) {
      return null;
    }

    const { tenant_id: _tenantId, created_at_ts, updated_at_ts, ...rest } =
      hook;

    const dates = convertDatesToAdapter(
      { created_at_ts, updated_at_ts },
      ["created_at_ts", "updated_at_ts"],
    );

    return removeNullProperties({
      ...rest,
      ...dates,
      enabled: !!rest.enabled,
      synchronous: !!rest.synchronous,
    });
  };
}
