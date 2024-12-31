import { Hook, HookInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListHooksResponse extends Totals {
  hooks: Hook[];
}

export interface HooksAdapter {
  create: (tenant_id: string, hook: HookInsert) => Promise<Hook>;
  remove: (tenant_id: string, hook_id: string) => Promise<boolean>;
  get: (tenant_id: string, hook_id: string) => Promise<Hook | null>;
  update: (
    tenant_id: string,
    hook_id: string,
    hook: Partial<HookInsert>,
  ) => Promise<boolean>;
  list: (tenant_id: string, params?: ListParams) => Promise<ListHooksResponse>;
}
