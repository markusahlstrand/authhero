import { nanoid } from "nanoid";
import {
  HooksAdapter,
  Hook,
  HookInsert,
  ListHooksResponse,
  ListParams,
  hookSchema,
} from "@authhero/adapter-interfaces";
import { DynamoDBContext, DynamoDBBaseItem } from "../types";
import { hookKeys } from "../keys";
import {
  getItem,
  putItem,
  deleteItem,
  queryWithPagination,
  updateItem,
  stripDynamoDBFields,
  removeNullProperties,
} from "../utils";

interface HookItem extends DynamoDBBaseItem {
  hook_id: string;
  tenant_id: string;
  trigger_id: string;
  url?: string;
  form_id?: string;
  template_id?: string;
  enabled: boolean;
  synchronous: boolean;
  priority?: number;
}

function toHook(item: HookItem): Hook {
  const { tenant_id, ...rest } = stripDynamoDBFields(item);
  return hookSchema.parse(removeNullProperties(rest));
}

export function createHooksAdapter(ctx: DynamoDBContext): HooksAdapter {
  return {
    async create(tenantId: string, hook: HookInsert): Promise<Hook> {
      const now = new Date().toISOString();
      const hookId = hook.hook_id || nanoid();

      // Extract url, form_id, and template_id from the union type
      const url = "url" in hook ? hook.url : undefined;
      const formId = "form_id" in hook ? hook.form_id : undefined;
      const templateId =
        "template_id" in hook ? hook.template_id : undefined;

      const item: HookItem = {
        PK: hookKeys.pk(tenantId),
        SK: hookKeys.sk(hookId),
        entityType: "HOOK",
        tenant_id: tenantId,
        hook_id: hookId,
        trigger_id: hook.trigger_id,
        url,
        form_id: formId,
        template_id: templateId,
        enabled: hook.enabled ?? false,
        synchronous: hook.synchronous ?? false,
        priority: hook.priority,
        created_at: now,
        updated_at: now,
      };

      await putItem(ctx, item);

      return toHook(item);
    },

    async get(tenantId: string, hookId: string): Promise<Hook | null> {
      const item = await getItem<HookItem>(
        ctx,
        hookKeys.pk(tenantId),
        hookKeys.sk(hookId),
      );

      if (!item) return null;

      return toHook(item);
    },

    async list(
      tenantId: string,
      params: ListParams = {},
    ): Promise<ListHooksResponse> {
      const result = await queryWithPagination<HookItem>(
        ctx,
        hookKeys.pk(tenantId),
        params,
        { skPrefix: "HOOK#" },
      );

      return {
        hooks: result.items.map(toHook),
        start: result.start,
        limit: result.limit,
        length: result.length,
      };
    },

    async update(
      tenantId: string,
      hookId: string,
      hook: Partial<HookInsert>,
    ): Promise<boolean> {
      const updates = {
        ...hook,
        updated_at: new Date().toISOString(),
      };

      // Remove hook_id from updates
      delete (updates as any).hook_id;

      return updateItem(
        ctx,
        hookKeys.pk(tenantId),
        hookKeys.sk(hookId),
        updates,
      );
    },

    async remove(tenantId: string, hookId: string): Promise<boolean> {
      return deleteItem(ctx, hookKeys.pk(tenantId), hookKeys.sk(hookId));
    },
  };
}
