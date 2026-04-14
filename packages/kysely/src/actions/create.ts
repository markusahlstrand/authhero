import { Kysely } from "kysely";
import { Action, ActionInsert } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { generateActionId } from "../utils/entity-id";

export function create(db: Kysely<Database>) {
  return async (tenant_id: string, action: ActionInsert): Promise<Action> => {
    const now = Date.now();
    const id = generateActionId();

    await db
      .insertInto("actions")
      .values({
        id,
        tenant_id,
        name: action.name,
        code: action.code,
        runtime: action.runtime || null,
        status: "built",
        secrets: action.secrets ? JSON.stringify(action.secrets) : null,
        dependencies: action.dependencies
          ? JSON.stringify(action.dependencies)
          : null,
        supported_triggers: action.supported_triggers
          ? JSON.stringify(action.supported_triggers)
          : null,
        created_at_ts: now,
        updated_at_ts: now,
      })
      .execute();

    return {
      id,
      tenant_id,
      name: action.name,
      code: action.code,
      runtime: action.runtime,
      status: "built",
      secrets: action.secrets?.map((s) => ({ name: s.name })),
      dependencies: action.dependencies,
      supported_triggers: action.supported_triggers,
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
  };
}
