import type { RaRecord } from "ra-core";

export interface UserIdentity {
  connection: string;
  provider: string;
  user_id: string;
  isSocial?: boolean;
}

export interface UserRecord extends RaRecord {
  email?: string;
  email_verified?: boolean;
  username?: string;
  phone_number?: string;
  phone_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  nickname?: string;
  picture?: string;
  birthdate?: string;
  address?: {
    formatted?: string;
    street_address?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  connection?: string;
  user_id?: string;
  last_login?: string;
  created_at?: string;
  identities?: UserIdentity[];
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}
