import { Kysely } from "kysely";
import { HookCode, HookCodeInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateHookCodeId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    hookCode: HookCodeInsert,
  ): Promise<HookCode> => {
    const now = Date.now();
    const id = generateHookCodeId();

    await db
      .insertInto("hook_code")
      .values({
        id,
        tenant_id,
        code: hookCode.code,
        secrets: hookCode.secrets ? JSON.stringify(hookCode.secrets) : null,
        created_at_ts: now,
        updated_at_ts: now,
      })
      .execute();

    return {
      id,
      tenant_id,
      code: hookCode.code,
      secrets: hookCode.secrets,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  };
}
