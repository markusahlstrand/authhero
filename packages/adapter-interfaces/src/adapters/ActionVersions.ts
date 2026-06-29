import { ActionVersion, ActionVersionInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";
import { CreateOptions } from "../types/ImportMetadata";

export interface ListActionVersionsResponse extends Totals {
  versions: ActionVersion[];
}

export interface ActionVersionsAdapter {
  /**
   * Append a new version row for an action. The adapter assigns the next
   * sequential `number` per action_id and clears the `deployed` flag on any
   * prior versions when the new one is created with `deployed: true`.
   */
  create: (
    tenant_id: string,
    version: ActionVersionInsert,
    options?: CreateOptions,
  ) => Promise<ActionVersion>;
  get: (
    tenant_id: string,
    action_id: string,
    version_id: string,
  ) => Promise<ActionVersion | null>;
  list: (
    tenant_id: string,
    action_id: string,
    params?: ListParams,
  ) => Promise<ListActionVersionsResponse>;
  /**
   * Remove every version row for an action — used when the parent action is
   * deleted. Returns the number of rows removed.
   */
  removeForAction: (tenant_id: string, action_id: string) => Promise<number>;
}
