import { eq, and } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import type { HookCode, HookCodeInsert } from "@authhero/adapter-interfaces";
import { hookCode } from "../schema/sqlite";
import { convertDatesToAdapter } from "../helpers/dates";
import type { DrizzleDb } from "./types";

const generateId = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyz",
  17,
);

function generateHookCodeId(): string {
  return `hc_${generateId()}`;
}

function sqlToHookCode(row: any): HookCode {
  const { created_at_ts, updated_at_ts, secrets, ...rest } = row;

  const dates = convertDatesToAdapter({ created_at_ts, updated_at_ts }, [
    "created_at_ts",
    "updated_at_ts",
  ]);

  return {
    ...rest,
    ...dates,
    secrets: secrets ? JSON.parse(secrets) : undefined,
  };
}

export function createHookCodeAdapter(db: DrizzleDb) {
  return {
    async create(tenant_id: string, input: HookCodeInsert): Promise<HookCode> {
      const now = Date.now();
      const id = generateHookCodeId();

      const values = {
        id,
        tenant_id,
        code: input.code,
        secrets: input.secrets ? JSON.stringify(input.secrets) : null,
        created_at_ts: now,
        updated_at_ts: now,
      };

      await db.insert(hookCode).values(values);

      return sqlToHookCode({ ...values, tenant_id });
    },

    async get(tenant_id: string, id: string): Promise<HookCode | null> {
      const result = await db
        .select()
        .from(hookCode)
        .where(and(eq(hookCode.tenant_id, tenant_id), eq(hookCode.id, id)))
        .get();

      if (!result) return null;
      return sqlToHookCode(result);
    },

    async update(
      tenant_id: string,
      id: string,
      params: Partial<HookCodeInsert>,
    ): Promise<boolean> {
      const updateData: any = {
        updated_at_ts: Date.now(),
      };

      if (params.code !== undefined) updateData.code = params.code;
      if (params.secrets !== undefined)
        updateData.secrets = JSON.stringify(params.secrets);

      const results = await db
        .update(hookCode)
        .set(updateData)
        .where(and(eq(hookCode.tenant_id, tenant_id), eq(hookCode.id, id)))
        .returning();

      return results.length > 0;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const results = await db
        .delete(hookCode)
        .where(and(eq(hookCode.tenant_id, tenant_id), eq(hookCode.id, id)))
        .returning();

      return results.length > 0;
    },
  };
}
