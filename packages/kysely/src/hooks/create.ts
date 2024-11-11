import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Hook, HookInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, hook: HookInsert): Promise<Hook> => {
    const createdHook: Hook = {
      hook_id: nanoid(),
      ...hook,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db
      .insertInto("hooks")
      .values({
        ...createdHook,
        tenant_id,
        enabled: hook.enabled ? 1 : 0,
        synchronous: hook.synchronous ? 1 : 0,
      })
      .execute();

    return createdHook;
  };
}
