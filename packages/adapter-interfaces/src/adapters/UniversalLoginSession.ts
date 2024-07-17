import {
  UniversalLoginSession,
  UniversalLoginSessionInsert,
} from "../types/UniversalLoginSession";

export interface UniversalLoginSessionsAdapter {
  create: (
    tenant_id: string,
    session: UniversalLoginSessionInsert,
  ) => Promise<void>;
  update: (
    tenant_id: string,
    id: string,
    session: UniversalLoginSession,
  ) => Promise<boolean>;
  get: (id: string) => Promise<UniversalLoginSession | null>;
}
