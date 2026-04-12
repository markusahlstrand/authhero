import { Kysely } from "kysely";
import { HookCode } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { convertDatesToAdapter } from "../utils/dateConversion";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string, id: string): Promise<HookCode | null> => {
    const row = await db
      .selectFrom("hook_code")
      .where("hook_code.tenant_id", "=", tenant_id)
      .where("hook_code.id", "=", id)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const { created_at_ts, updated_at_ts, secrets, ...rest } = row;

    const dates = convertDatesToAdapter({ created_at_ts, updated_at_ts }, [
      "created_at_ts",
      "updated_at_ts",
    ]);

    return {
      ...rest,
      ...dates,
      secrets: secrets
        ? (() => {
            try {
              return JSON.parse(secrets);
            } catch {
              console.warn(`Failed to parse secrets for hook_code ${id}`);
              return undefined;
            }
          })()
        : undefined,
    } as HookCode;
  };
}
