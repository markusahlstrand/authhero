import { User, Totals, UserInsert } from "../types";
import { ListParams } from "../types/ListParams";

export interface ListUsersResponse extends Totals {
  users: User[];
}

export interface UserDataAdapter {
  get(tenant_id: string, id: string): Promise<User | null>;
  create(tenantId: string, user: UserInsert): Promise<User>;
  /**
   * Create a user without invoking any decorator-level hooks (pre/post
   * registration hooks, linking, webhooks, etc.). Intended to be called from
   * inside a registration pipeline that owns hook orchestration and transaction
   * boundaries itself. The DB-level behavior is identical to `create`.
   */
  rawCreate(tenantId: string, user: UserInsert): Promise<User>;
  remove(tenantId: string, id: string): Promise<boolean>;
  list(tenantId: string, params?: ListParams): Promise<ListUsersResponse>;
  update(tenantId: string, id: string, user: Partial<User>): Promise<boolean>;
  unlink(
    tenantId: string,
    id: string,
    provider: string,
    linked_user_id: string,
  ): Promise<boolean>;
}
