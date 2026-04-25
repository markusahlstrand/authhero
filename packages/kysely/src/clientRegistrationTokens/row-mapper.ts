import {
  ClientRegistrationToken,
  ClientRegistrationTokenType,
  clientRegistrationTokenTypeSchema,
  isPlainObject,
} from "@authhero/adapter-interfaces";
import { dbDateToIso, dbDateToIsoRequired } from "../utils/dateConversion";

type Row = {
  id: string;
  tenant_id: string;
  token_hash: string;
  type: string;
  client_id: string | null | undefined;
  sub: string | null | undefined;
  constraints: string | null | undefined;
  single_use: number;
  used_at_ts: number | null | undefined;
  expires_at_ts: number | null | undefined;
  created_at_ts: number;
  revoked_at_ts: number | null | undefined;
};

function parseType(value: string): ClientRegistrationTokenType {
  const parsed = clientRegistrationTokenTypeSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Unknown client_registration_tokens.type: ${value}`);
  }
  return parsed.data;
}

function parseConstraints(
  raw: string | null | undefined,
): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return isPlainObject(parsed) ? parsed : undefined;
}

export function rowToToken(row: Row): ClientRegistrationToken {
  return {
    id: row.id,
    token_hash: row.token_hash,
    type: parseType(row.type),
    client_id: row.client_id ?? undefined,
    sub: row.sub ?? undefined,
    constraints: parseConstraints(row.constraints),
    single_use: !!row.single_use,
    expires_at: dbDateToIso(row.expires_at_ts),
    used_at: dbDateToIso(row.used_at_ts),
    revoked_at: dbDateToIso(row.revoked_at_ts),
    created_at: dbDateToIsoRequired(row.created_at_ts),
  };
}
