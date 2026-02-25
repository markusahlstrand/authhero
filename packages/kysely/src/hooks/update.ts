import { Kysely } from "kysely";
import { HookInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function update(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    hook_id: string,
    hook: Partial<HookInsert>,
  ): Promise<boolean> => {
    const { hook_id: _hookId, ...rest } = hook;

    const sqlHook = {
      ...rest,
      updated_at_ts: Date.now(),
      enabled: hook.enabled !== undefined ? (hook.enabled ? 1 : 0) : undefined,
      synchronous:
        hook.synchronous !== undefined
          ? hook.synchronous
            ? 1
            : 0
          : undefined,
    };

    await db
      .updateTable("hooks")
      .set(sqlHook)
      .where("hooks.hook_id", "=", hook_id)
      .where("hooks.tenant_id", "=", tenant_id)
      .execute();

    return true;
  };
}
