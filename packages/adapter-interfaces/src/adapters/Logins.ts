import { Login, LoginInsert } from "../types";

export interface LoginsAdapter {
  create: (tenant_id: string, session: LoginInsert) => Promise<Login>;
  update: (
    tenant_id: string,
    login_id: string,
    session: Partial<Login>,
  ) => Promise<boolean>;
  get: (tenant_id: string, login_id: string) => Promise<Login | null>;
  remove: (tenant_id: string, login_id: string) => Promise<boolean>;
}
