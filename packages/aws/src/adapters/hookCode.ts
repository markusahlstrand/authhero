import { nanoid } from "nanoid";
import {
  HookCodeAdapter,
  HookCode,
  HookCodeInsert,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { getItem, putItem, deleteItem, stripDynamoDBFields } from "../utils";

interface HookCodeItem extends DynamoDBBaseItem {
  id: string;
  tenant_id: string;
  code: string;
  secrets?: string | null;
}

const hookCodeKeys = {
  pk: (tenantId: string) => `TENANT#${tenantId}`,
  sk: (id: string) => `HOOK_CODE#${id}`,
};

function toHookCode(item: HookCodeItem): HookCode {
  const { tenant_id, secrets, ...rest } = stripDynamoDBFields(item);
  return {
    ...rest,
    tenant_id,
    secrets: secrets ? JSON.parse(secrets) : undefined,
  } as HookCode;
}

export function createHookCodeAdapter(ctx: DynamoDBContext): HookCodeAdapter {
  return {
    async create(tenantId: string, input: HookCodeInsert): Promise<HookCode> {
      const now = new Date().toISOString();
      const id = `hc_${nanoid()}`;

      const item: HookCodeItem = {
        PK: hookCodeKeys.pk(tenantId),
        SK: hookCodeKeys.sk(id),
        entityType: "HOOK_CODE",
        id,
        tenant_id: tenantId,
        code: input.code,
        secrets: input.secrets ? JSON.stringify(input.secrets) : null,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);
      return toHookCode(item);
    },

    async get(tenantId: string, id: string): Promise<HookCode | null> {
      const item = await getItem<HookCodeItem>(
        ctx,
        hookCodeKeys.pk(tenantId),
        hookCodeKeys.sk(id),
      );

      if (!item) return null;
      return toHookCode(item);
    },

    async update(
      tenantId: string,
      id: string,
      input: Partial<HookCodeInsert>,
    ): Promise<boolean> {
      const existing = await getItem<HookCodeItem>(
        ctx,
        hookCodeKeys.pk(tenantId),
        hookCodeKeys.sk(id),
      );

      if (!existing) return false;

      const updated: HookCodeItem = {
        ...existing,
        updated_at: new Date().toISOString(),
      };

      if (input.code !== undefined) updated.code = input.code;
      if (input.secrets !== undefined)
        updated.secrets = JSON.stringify(input.secrets);

      await putItem(ctx, updated);
      return true;
    },

    async remove(tenantId: string, id: string): Promise<boolean> {
      const existing = await getItem<HookCodeItem>(
        ctx,
        hookCodeKeys.pk(tenantId),
        hookCodeKeys.sk(id),
      );

      if (!existing) return false;

      await deleteItem(ctx, hookCodeKeys.pk(tenantId), hookCodeKeys.sk(id));
      return true;
    },
  };
}
