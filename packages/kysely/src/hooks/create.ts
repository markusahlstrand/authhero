import { Kysely } from "kysely";
import { Hook, HookInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateHookId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, hook: HookInsert): Promise<Hook> => {
    const now = Date.now();
    const hookId = hook.hook_id || generateHookId();

    const { hook_id: _hookId, enabled, synchronous, metadata, ...rest } = hook;

    await db
      .insertInto("hooks")
      .values({
        ...rest,
        hook_id: hookId,
        tenant_id,
        enabled: enabled ? 1 : 0,
        synchronous: synchronous ? 1 : 0,
        metadata: metadata ? JSON.stringify(metadata) : null,
        created_at_ts: now,
        updated_at_ts: now,
      })
      .execute();

    return {
      ...rest,
      hook_id: hookId,
      enabled: enabled ?? false,
      synchronous: synchronous ?? false,
      ...(metadata ? { metadata } : {}),
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  };
}
