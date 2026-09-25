import { and, asc, eq } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import {
  TOKEN_EXCHANGE_PROFILE_TYPE,
  tokenExchangeJwtVerificationSchema,
} from "@authhero/adapter-interfaces";
import type {
  CreateOptions,
  TokenExchangeJwtVerification,
  TokenExchangeProfile,
  TokenExchangeProfileInsert,
  TokenExchangeProfileUpdate,
  TokenExchangeProfilesAdapter,
} from "@authhero/adapter-interfaces";
import { tokenExchangeProfiles } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

const generateId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 17);

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

function rowToProfile(
  row: typeof tokenExchangeProfiles.$inferSelect,
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

export function createTokenExchangeProfilesAdapter(
  db: DrizzleDb,
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

      await db.insert(tokenExchangeProfiles).values(row);

      return rowToProfile(row);
    },

    async get(
      tenant_id: string,
      id: string,
    ): Promise<TokenExchangeProfile | null> {
      const rows = await db
        .select()
        .from(tokenExchangeProfiles)
        .where(
          and(
            eq(tokenExchangeProfiles.tenant_id, tenant_id),
            eq(tokenExchangeProfiles.id, id),
          ),
        )
        .limit(1);
      return rows[0] ? rowToProfile(rows[0]) : null;
    },

    async list(tenant_id: string): Promise<TokenExchangeProfile[]> {
      const rows = await db
        .select()
        .from(tokenExchangeProfiles)
        .where(eq(tokenExchangeProfiles.tenant_id, tenant_id))
        .orderBy(
          asc(tokenExchangeProfiles.created_at),
          asc(tokenExchangeProfiles.id),
        );
      return rows.map(rowToProfile);
    },

    async update(
      tenant_id: string,
      id: string,
      input: TokenExchangeProfileUpdate,
    ): Promise<boolean> {
      const set: Partial<typeof tokenExchangeProfiles.$inferInsert> = {
        updated_at: new Date().toISOString(),
      };
      if (input.name !== undefined) set.name = input.name;
      if (input.subject_token_type !== undefined)
        set.subject_token_type = input.subject_token_type;
      if (input.jwt_verification !== undefined)
        set.jwt_verification = JSON.stringify(input.jwt_verification);

      const updated = await db
        .update(tokenExchangeProfiles)
        .set(set)
        .where(
          and(
            eq(tokenExchangeProfiles.tenant_id, tenant_id),
            eq(tokenExchangeProfiles.id, id),
          ),
        )
        .returning({ id: tokenExchangeProfiles.id });
      return updated.length > 0;
    },

    async remove(tenant_id: string, id: string): Promise<boolean> {
      const deleted = await db
        .delete(tokenExchangeProfiles)
        .where(
          and(
            eq(tokenExchangeProfiles.tenant_id, tenant_id),
            eq(tokenExchangeProfiles.id, id),
          ),
        )
        .returning({ id: tokenExchangeProfiles.id });
      return deleted.length > 0;
    },
  };
}
