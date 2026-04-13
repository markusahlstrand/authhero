import { eq, and } from "drizzle-orm";
import type { AuthenticationMethod } from "@authhero/adapter-interfaces";
import { authenticationMethods } from "../schema/sqlite";
import { removeNullProperties, parseJsonIfString } from "../helpers/transform";
import { dbDateToIsoRequired } from "../helpers/dates";
import type { DrizzleDb } from "./types";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ENCODING_LEN = ENCODING.length;

function ulid(): string {
  const TIME_LEN = 10;
  const RANDOM_LEN = 16;

  let now = Date.now();
  let str = "";
  for (let i = TIME_LEN; i > 0; i--) {
    str = ENCODING.charAt(now % ENCODING_LEN) + str;
    now = Math.floor(now / ENCODING_LEN);
  }

  const buffer = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(buffer);
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING.charAt(buffer[i]! % ENCODING_LEN);
  }

  return str;
}

function sqlToMethod(row: any): AuthenticationMethod {
  const {
    tenant_id: _,
    created_at_ts,
    updated_at_ts,
    credential_backed_up,
    confirmed,
    transports,
    ...rest
  } = row;

  return removeNullProperties({
    ...rest,
    confirmed: !!confirmed,
    credential_backed_up:
      credential_backed_up != null ? !!credential_backed_up : undefined,
    transports: parseJsonIfString(transports),
    created_at: dbDateToIsoRequired(created_at_ts),
    updated_at: dbDateToIsoRequired(updated_at_ts),
  });
}

export function createAuthenticationMethodsAdapter(db: DrizzleDb) {
  return {
    async create(
      tenant_id: string,
      method: any,
    ): Promise<AuthenticationMethod> {
      const now = Date.now();
      const id = method.id || ulid();

      const values = {
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
          method.credential_backed_up != null
            ? method.credential_backed_up
              ? 1
              : 0
            : null,
        transports: method.transports
          ? JSON.stringify(method.transports)
          : null,
        friendly_name: method.friendly_name,
        confirmed: method.confirmed ? 1 : 0,
        created_at_ts: now,
        updated_at_ts: now,
      };

      await db.insert(authenticationMethods).values(values);

      return sqlToMethod({ ...values, tenant_id });
    },

    async get(
      tenant_id: string,
      method_id: string,
    ): Promise<AuthenticationMethod | null> {
      const result = await db
        .select()
        .from(authenticationMethods)
        .where(
          and(
            eq(authenticationMethods.tenant_id, tenant_id),
            eq(authenticationMethods.id, method_id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToMethod(result);
    },

    async getByCredentialId(
      tenant_id: string,
      credential_id: string,
    ): Promise<AuthenticationMethod | null> {
      const result = await db
        .select()
        .from(authenticationMethods)
        .where(
          and(
            eq(authenticationMethods.tenant_id, tenant_id),
            eq(authenticationMethods.credential_id, credential_id),
          ),
        )
        .get();

      if (!result) return null;
      return sqlToMethod(result);
    },

    async list(
      tenant_id: string,
      user_id: string,
    ): Promise<AuthenticationMethod[]> {
      const results = await db
        .select()
        .from(authenticationMethods)
        .where(
          and(
            eq(authenticationMethods.tenant_id, tenant_id),
            eq(authenticationMethods.user_id, user_id),
          ),
        )
        .all();

      return results.map(sqlToMethod);
    },

    async update(
      tenant_id: string,
      method_id: string,
      data: Partial<AuthenticationMethod>,
    ): Promise<AuthenticationMethod> {
      const updateData: any = {
        updated_at_ts: Date.now(),
      };

      if (data.type !== undefined) updateData.type = data.type;
      if (data.phone_number !== undefined)
        updateData.phone_number = data.phone_number;
      if (data.totp_secret !== undefined)
        updateData.totp_secret = data.totp_secret;
      if (data.credential_id !== undefined)
        updateData.credential_id = data.credential_id;
      if (data.public_key !== undefined)
        updateData.public_key = data.public_key;
      if (data.sign_count !== undefined)
        updateData.sign_count = data.sign_count;
      if (data.credential_backed_up !== undefined)
        updateData.credential_backed_up = data.credential_backed_up ? 1 : 0;
      if (data.transports !== undefined)
        updateData.transports = JSON.stringify(data.transports);
      if (data.friendly_name !== undefined)
        updateData.friendly_name = data.friendly_name;
      if (data.confirmed !== undefined)
        updateData.confirmed = data.confirmed ? 1 : 0;

      await db
        .update(authenticationMethods)
        .set(updateData)
        .where(
          and(
            eq(authenticationMethods.tenant_id, tenant_id),
            eq(authenticationMethods.id, method_id),
          ),
        );

      const result = await this.get(tenant_id, method_id);
      if (!result) {
        throw new Error(
          `Authentication method ${method_id} not found after update`,
        );
      }
      return result;
    },

    async remove(tenant_id: string, method_id: string): Promise<boolean> {
      const results = await db
        .delete(authenticationMethods)
        .where(
          and(
            eq(authenticationMethods.tenant_id, tenant_id),
            eq(authenticationMethods.id, method_id),
          ),
        )
        .returning();

      return results.length > 0;
    },
  };
}
