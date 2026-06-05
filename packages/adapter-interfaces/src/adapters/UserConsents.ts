import { ListParams } from "../types/ListParams";
import { Totals } from "../types";
import { UserConsent, UserConsentInsert } from "../types/UserConsent";

export interface ListUserConsentsResponse extends Totals {
  user_consents: UserConsent[];
}

export interface UserConsentsAdapter {
  /**
   * Upsert a consent record. If a row already exists for
   * (tenant_id, user_id, client_id) the supplied scopes are unioned
   * into the stored scopes array; otherwise a new row is created.
   */
  create: (
    tenant_id: string,
    consent: UserConsentInsert,
  ) => Promise<UserConsent>;
  get: (
    tenant_id: string,
    user_id: string,
    client_id: string,
  ) => Promise<UserConsent | null>;
  list: (
    tenant_id: string,
    params?: ListParams,
  ) => Promise<ListUserConsentsResponse>;
  remove: (
    tenant_id: string,
    user_id: string,
    client_id: string,
  ) => Promise<boolean>;
}
