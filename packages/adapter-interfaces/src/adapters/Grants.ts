import { ListParams } from "../types/ListParams";
import { Totals } from "../types";
import { Grant, GrantInsert } from "../types/Grant";

export interface ListGrantsResponse extends Totals {
  grants: Grant[];
}

export interface GrantsAdapter {
  /**
   * Upsert a grant. If a row already exists for
   * (tenant_id, user_id, clientID, audience) the supplied scopes are unioned
   * into the stored scope array; otherwise a new row is created.
   */
  create: (tenant_id: string, grant: GrantInsert) => Promise<Grant>;
  get: (
    tenant_id: string,
    user_id: string,
    clientID: string,
    audience?: string,
  ) => Promise<Grant | null>;
  list: (
    tenant_id: string,
    params?: ListParams,
  ) => Promise<ListGrantsResponse>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
  removeByUser: (tenant_id: string, user_id: string) => Promise<boolean>;
}
