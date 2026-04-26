import { Kysely } from "kysely";
import {
  ClientRegistrationToken,
  ClientRegistrationTokenInsert,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { isoToDbDate } from "../utils/dateConversion";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    params: ClientRegistrationTokenInsert,
  ): Promise<ClientRegistrationToken> => {
    const now = Date.now();

    await db
      .insertInto("client_registration_tokens")
      .values({
        id: params.id,
        tenant_id,
        token_hash: params.token_hash,
        type: params.type,
        client_id: params.client_id ?? null,
        sub: params.sub ?? null,
        constraints: params.constraints
          ? JSON.stringify(params.constraints)
          : null,
        single_use: params.single_use ? 1 : 0,
        expires_at_ts: isoToDbDate(params.expires_at),
        created_at_ts: now,
        used_at_ts: null,
        revoked_at_ts: null,
      })
      .execute();

    return {
      id: params.id,
      token_hash: params.token_hash,
      type: params.type,
      client_id: params.client_id,
      sub: params.sub,
      constraints: params.constraints,
      single_use: params.single_use,
      expires_at: params.expires_at,
      created_at: new Date(now).toISOString(),
    };
  };
}
