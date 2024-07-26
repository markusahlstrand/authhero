import { User, Totals } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListUsersResponse extends Totals {
  users: User[];
}

export interface UserDataAdapter {
  get(tenant_id: string, id: string): Promise<User | null>;
  create(tenantId: string, user: User): Promise<User>;
  remove(tenantId: string, id: string): Promise<boolean>;
  list(tenantId: string, params: ListParams): Promise<ListUsersResponse>;
  update(tenantId: string, id: string, user: Partial<User>): Promise<boolean>;
  unlink(
    tenantId: string,
    id: string,
    provider: string,
    linked_user_id: string,
  ): Promise<boolean>;
}
