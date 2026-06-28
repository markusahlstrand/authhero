import { HookCode, HookCodeInsert } from "../types";
import { CreateOptions } from "../types/ImportMetadata";

export interface HookCodeAdapter {
  create: (
    tenant_id: string,
    hookCode: HookCodeInsert,
    options?: CreateOptions,
  ) => Promise<HookCode>;
  get: (tenant_id: string, id: string) => Promise<HookCode | null>;
  update: (
    tenant_id: string,
    id: string,
    hookCode: Partial<HookCodeInsert>,
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
