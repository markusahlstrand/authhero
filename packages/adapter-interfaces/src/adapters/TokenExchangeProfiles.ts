import {
  TokenExchangeProfile,
  TokenExchangeProfileInsert,
  TokenExchangeProfileUpdate,
} from "../types/TokenExchangeProfile";
import { CreateOptions } from "../types/ImportMetadata";

export interface TokenExchangeProfilesAdapter {
  create(
    tenant_id: string,
    profile: TokenExchangeProfileInsert,
    options?: CreateOptions,
  ): Promise<TokenExchangeProfile>;
  get(tenant_id: string, id: string): Promise<TokenExchangeProfile | null>;
  /**
   * All profiles for the tenant, oldest first. Tenants hold a handful of
   * profiles, so the management API pages in memory and the token endpoint
   * resolves a `subject_token_type` from this list.
   */
  list(tenant_id: string): Promise<TokenExchangeProfile[]>;
  update(
    tenant_id: string,
    id: string,
    profile: TokenExchangeProfileUpdate,
  ): Promise<boolean>;
  remove(tenant_id: string, id: string): Promise<boolean>;
}
