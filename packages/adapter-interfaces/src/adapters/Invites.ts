import { Invite, InviteInsert, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListInvitesResponse extends Totals {
  invites: Invite[];
}

export interface InvitesAdapter {
  create(tenant_id: string, params: InviteInsert): Promise<Invite>;
  get(tenant_id: string, id: string): Promise<Invite | null>;
  remove(tenant_id: string, id: string): Promise<boolean>;
  list(tenant_id: string, params?: ListParams): Promise<ListInvitesResponse>;
  update(
    tenant_id: string,
    id: string,
    params: Partial<InviteInsert>,
  ): Promise<boolean>;
}
