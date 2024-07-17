import { Session, SessionInsert } from "../types";

export interface SessionsAdapter {
  create: (tenant_id: string, session: SessionInsert) => Promise<Session>;
  get: (tenant_id: string, id: string) => Promise<Session | null>;
  update: (
    tenant_id: string,
    id: string,
    session: { used_at: string },
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
