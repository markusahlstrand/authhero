import { LoginSession, LoginSessionInsert } from "../types";

export interface LoginSessionsAdapter {
  create: (
    tenant_id: string,
    session: LoginSessionInsert,
  ) => Promise<LoginSession>;
  update: (
    tenant_id: string,
    login_id: string,
    session: Partial<LoginSession>,
  ) => Promise<boolean>;
  get: (tenant_id: string, login_id: string) => Promise<LoginSession | null>;
  remove: (tenant_id: string, login_id: string) => Promise<boolean>;
}
