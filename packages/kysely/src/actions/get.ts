import { Kysely } from "kysely";
import { Action } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { convertDatesToAdapter } from "../utils/dateConversion";

function parseJsonField<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export function get(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    action_id: string,
  ): Promise<Action | null> => {
    const row = await db
      .selectFrom("actions")
      .where("actions.tenant_id", "=", tenant_id)
      .where("actions.id", "=", action_id)
      .selectAll()
      .executeTakeFirst();

    if (!row) {
      return null;
    }

    const {
      created_at_ts,
      updated_at_ts,
      deployed_at_ts,
      secrets,
      dependencies,
      supported_triggers,
      tenant_id: _tenantId,
      ...rest
    } = row;

    const dates = convertDatesToAdapter({ created_at_ts, updated_at_ts }, [
      "created_at_ts",
      "updated_at_ts",
    ]);

    return {
      ...rest,
      tenant_id,
      ...dates,
      runtime: rest.runtime ?? undefined,
      status: (rest.status as "draft" | "built") || "built",
      deployed_at: deployed_at_ts
        ? new Date(Number(deployed_at_ts)).toISOString()
        : undefined,
      secrets: parseJsonField<Array<{ name: string; value?: string }>>(secrets),
      dependencies:
        parseJsonField<Array<{ name: string; version: string }>>(dependencies),
      supported_triggers:
        parseJsonField<Array<{ id: string; version?: string }>>(
          supported_triggers,
        ),
    } as Action;
  };
}
