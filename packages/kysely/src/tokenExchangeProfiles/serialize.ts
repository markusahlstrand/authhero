import {
  TOKEN_EXCHANGE_PROFILE_TYPE,
  TokenExchangeJwtVerification,
  TokenExchangeProfile,
  tokenExchangeJwtVerificationSchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

export type TokenExchangeProfileRow = Database["token_exchange_profiles"];

export function rowToTokenExchangeProfile(
  row: TokenExchangeProfileRow,
): TokenExchangeProfile {
  const profile: TokenExchangeProfile = {
    id: row.id,
    name: row.name,
    subject_token_type: row.subject_token_type,
    type: TOKEN_EXCHANGE_PROFILE_TYPE,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.action_id) profile.action_id = row.action_id;
  const jwtVerification = parseJwtVerification(row.jwt_verification);
  if (jwtVerification) profile.jwt_verification = jwtVerification;
  return profile;
}

// A row whose JSON no longer parses surfaces without `jwt_verification`, so
// the profile has no way to verify tokens and the exchange is refused.
function parseJwtVerification(
  raw: string | null,
): TokenExchangeJwtVerification | undefined {
  if (!raw) return undefined;
  try {
    const parsed = tokenExchangeJwtVerificationSchema.safeParse(
      JSON.parse(raw),
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
