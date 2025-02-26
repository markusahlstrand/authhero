import { Password, PasswordInsert } from "../types";

export interface PasswordsAdapter {
  create: (tenant_id: string, params: PasswordInsert) => Promise<Password>;
  update: (tenant_id: string, params: PasswordInsert) => Promise<boolean>;
  get: (tenant_id: string, user_id: string) => Promise<Password | null>;
}
