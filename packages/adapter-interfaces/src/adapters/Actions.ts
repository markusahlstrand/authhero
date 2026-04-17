import { Action, ActionInsert, ActionUpdate, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListActionsResponse extends Totals {
  actions: Action[];
}

export interface ActionsAdapter {
  create: (tenant_id: string, action: ActionInsert) => Promise<Action>;
  get: (tenant_id: string, action_id: string) => Promise<Action | null>;
  update: (
    tenant_id: string,
    action_id: string,
    action: ActionUpdate,
  ) => Promise<boolean>;
  remove: (tenant_id: string, action_id: string) => Promise<boolean>;
  list: (
    tenant_id: string,
    params?: ListParams,
  ) => Promise<ListActionsResponse>;
}
