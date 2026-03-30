import {
  AuthenticationMethod,
  AuthenticationMethodInsert,
  AuthenticationMethodUpdate,
} from "../types/AuthenticationMethod";

export interface AuthenticationMethodsAdapter {
  create: (
    tenant_id: string,
    method: AuthenticationMethodInsert,
  ) => Promise<AuthenticationMethod>;
  get: (
    tenant_id: string,
    method_id: string,
  ) => Promise<AuthenticationMethod | null>;
  list: (tenant_id: string, user_id: string) => Promise<AuthenticationMethod[]>;
  update: (
    tenant_id: string,
    method_id: string,
    data: AuthenticationMethodUpdate,
  ) => Promise<AuthenticationMethod>;
  remove: (tenant_id: string, method_id: string) => Promise<boolean>;
}
