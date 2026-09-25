import { Kysely } from "kysely";
import { customAlphabet } from "nanoid";
import {
  CreateOptions,
  TOKEN_EXCHANGE_PROFILE_TYPE,
  TokenExchangeProfile,
  TokenExchangeProfileInsert,
  TokenExchangeProfileUpdate,
  TokenExchangeProfilesAdapter,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { rowToTokenExchangeProfile } from "./serialize";

const generateId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);

export function createTokenExchangeProfilesAdapter(
  db: Kysely<Database>,
): TokenExchangeProfilesAdapter {
  return {
    async create(
      tenant_id: string,
      input: TokenExchangeProfileInsert,
      options?: CreateOptions,
    ): Promise<TokenExchangeProfile> {
      const importMetadata = options?.importMetadata;
      const now = new Date().toISOString();
      const row = {
        id: importMetadata?.id ?? `tep_${generateId()}`,
        tenant_id,
        name: input.name,
        subject_token_type: input.subject_token_type,
        action_id: input.action_id ?? null,
        type: TOKEN_EXCHANGE_PROFILE_TYPE,
        jwt_verification: input.jwt_verification
          ? JSON.stringify(input.jwt_verification)
          : null,
        created_at: importMetadata?.created_at ?? now,
        updated_at: importMetadata?.updated_at ?? now,
      };

      await db.insertInto("token_exchange_profiles").values(row).execute();

      return rowToTokenExchangeProfile(row);
    },

    async get(
      tenant_id: string,
      id: string,
    ): Promise<TokenExchangeProfile | null> {
      const row = await db
        .selectFrom("token_exchange_profiles")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToTokenExchangeProfile(row) : null;
    },

    async list(tenant_id: string): Promise<TokenExchangeProfile[]> {
      const rows = await db
        .selectFrom("token_exchange_profiles")
        .where("tenant_id", "=", tenant_id)
        .selectAll()
        .orderBy("created_at", "asc")
        .orderBy("id", "asc")
        .execute();
      return rows.map(rowToTokenExchangeProfile);
    },

    async update(
      tenant_id: string,
      id: string,
      input: TokenExchangeProfileUpdate,
    ): Promise<boolean> {
      const set: Record<string, string> = {
        updated_at: new Date().toISOString(),
      };
      if (input.name !== undefined) set.name = input.name;
      if (input.subject_token_type !== undefined)
        set.subject_token_type = input.subject_token_type;
      if (input.jwt_verification !== undefined)
        set.jwt_verification = JSON.stringify(input.jwt_verification);

      const result = await db
        .updateTable("token_exchange_profiles")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .set(set)
        .executeTakeFirst();

      return Number(result.numUpdatedRows) > 0;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("token_exchange_profiles")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}
