import { Kysely } from "kysely";
import { CreateOptions, Hook, HookInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateHookId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    hook: HookInsert,
    options?: CreateOptions,
  ): Promise<Hook> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const createdAt = importMetadata?.created_at ?? now;
    const updatedAt = importMetadata?.updated_at ?? now;
    const hookId =
      importMetadata?.id ?? (hook.hook_id || generateHookId());

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
        created_at_ts: new Date(createdAt).getTime(),
        updated_at_ts: new Date(updatedAt).getTime(),
      })
      .execute();

    return {
      ...rest,
      hook_id: hookId,
      enabled: enabled ?? false,
      synchronous: synchronous ?? false,
      ...(metadata ? { metadata } : {}),
      created_at: createdAt,
      updated_at: updatedAt,
    };
  };
}
