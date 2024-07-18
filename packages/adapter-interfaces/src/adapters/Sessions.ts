import { Session, SessionInsert, Totals } from "../types";
import { ListParams } from "./ListParams";

export interface ListSesssionsResponse extends Totals {
  sessions: Session[];
}

export interface SessionsAdapter {
  create: (tenant_id: string, session: SessionInsert) => Promise<Session>;
  get: (tenant_id: string, id: string) => Promise<Session | null>;
  list(tenantId: string, params: ListParams): Promise<ListSesssionsResponse>;
  update: (
    tenant_id: string,
    id: string,
    session: { used_at: string },
  ) => Promise<boolean>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
}
