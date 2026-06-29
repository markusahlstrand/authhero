import {
  AuthenticationMethod,
  AuthenticationMethodInsert,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";
import { ulid } from "../utils/ulid";

export function create(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    method: AuthenticationMethodInsert,
    options?: CreateOptions,
  ): Promise<AuthenticationMethod> => {
    const importMetadata = options?.importMetadata;
    const createdAtTs = importMetadata?.created_at
      ? new Date(importMetadata.created_at).getTime()
      : Date.now();
    const updatedAtTs = importMetadata?.updated_at
      ? new Date(importMetadata.updated_at).getTime()
      : createdAtTs;
    const id = importMetadata?.id ?? ulid();

    await db
      .insertInto("authentication_methods")
      .values({
        id,
        tenant_id,
        user_id: method.user_id,
        type: method.type,
        phone_number: method.phone_number,
        totp_secret: method.totp_secret,
        credential_id: method.credential_id,
        public_key: method.public_key,
        sign_count: method.sign_count,
        credential_backed_up:
          method.credential_backed_up == null
            ? undefined
            : method.credential_backed_up
              ? 1
              : 0,
        transports: method.transports
          ? JSON.stringify(method.transports)
          : undefined,
        friendly_name: method.friendly_name,
        confirmed: method.confirmed ? 1 : 0,
        created_at_ts: createdAtTs,
        updated_at_ts: updatedAtTs,
      })
      .execute();

    return {
      id,
      user_id: method.user_id,
      type: method.type,
      phone_number: method.phone_number,
      totp_secret: method.totp_secret,
      credential_id: method.credential_id,
      public_key: method.public_key,
      sign_count: method.sign_count,
      credential_backed_up: method.credential_backed_up,
      transports: method.transports,
      friendly_name: method.friendly_name,
      confirmed: method.confirmed ?? false,
      created_at: new Date(createdAtTs).toISOString(),
      updated_at: new Date(updatedAtTs).toISOString(),
    };
  };
}
