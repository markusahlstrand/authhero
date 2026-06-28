import { Kysely } from "kysely";
import {
  CreateOptions,
  HookCode,
  HookCodeInsert,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateHookCodeId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    hookCode: HookCodeInsert,
    options?: CreateOptions,
  ): Promise<HookCode> => {
    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();
    const createdAt = importMetadata?.created_at ?? now;
    const updatedAt = importMetadata?.updated_at ?? now;
    const id = importMetadata?.id ?? generateHookCodeId();

    await db
      .insertInto("hook_code")
      .values({
        id,
        tenant_id,
        code: hookCode.code,
        secrets: hookCode.secrets ? JSON.stringify(hookCode.secrets) : null,
        created_at_ts: new Date(createdAt).getTime(),
        updated_at_ts: new Date(updatedAt).getTime(),
      })
      .execute();

    return {
      id,
      tenant_id,
      code: hookCode.code,
      secrets: hookCode.secrets,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  };
}
