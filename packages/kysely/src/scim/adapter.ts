import { Kysely } from "kysely";
import {
  ScimConfiguration,
  ScimConfigurationInsert,
  ScimConfigurationsAdapter,
  ScimToken,
  ScimTokenInsert,
  ScimTokensAdapter,
  ScimExternalId,
  ScimExternalIdInsert,
  ScimExternalIdsAdapter,
  ScimMappingEntry,
  scimMappingEntrySchema,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

function parseMapping(raw: string | null | undefined): ScimMappingEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const result: ScimMappingEntry[] = [];
    for (const entry of parsed) {
      const validated = scimMappingEntrySchema.safeParse(entry);
      if (validated.success) result.push(validated.data);
    }
    return result;
  } catch {
    return [];
  }
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string");
  } catch {
    return [];
  }
}

function rowToConfiguration(row: {
  connection_id: string;
  user_id_attribute: string;
  mapping: string;
  created_at: string;
  updated_at: string;
}): ScimConfiguration {
  return {
    connection_id: row.connection_id,
    user_id_attribute: row.user_id_attribute,
    mapping: parseMapping(row.mapping),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createScimConfigurationsAdapter(
  db: Kysely<Database>,
): ScimConfigurationsAdapter {
  return {
    async create(
      tenant_id: string,
      input: ScimConfigurationInsert,
    ): Promise<ScimConfiguration> {
      const now = new Date().toISOString();
      await db
        .insertInto("scim_configurations")
        .values({
          connection_id: input.connection_id,
          tenant_id,
          user_id_attribute: input.user_id_attribute,
          mapping: JSON.stringify(input.mapping),
          created_at: now,
          updated_at: now,
        })
        .execute();

      return {
        connection_id: input.connection_id,
        user_id_attribute: input.user_id_attribute,
        mapping: input.mapping,
        created_at: now,
        updated_at: now,
      };
    },

    async get(
      tenant_id: string,
      connection_id: string,
    ): Promise<ScimConfiguration | null> {
      const row = await db
        .selectFrom("scim_configurations")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToConfiguration(row) : null;
    },

    async update(
      tenant_id: string,
      connection_id: string,
      input: Partial<ScimConfigurationInsert>,
    ): Promise<boolean> {
      const set: Record<string, string> = {
        updated_at: new Date().toISOString(),
      };
      if (input.user_id_attribute !== undefined)
        set.user_id_attribute = input.user_id_attribute;
      if (input.mapping !== undefined)
        set.mapping = JSON.stringify(input.mapping);

      const result = await db
        .updateTable("scim_configurations")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .set(set)
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async remove(tenant_id: string, connection_id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("scim_configurations")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}

function rowToToken(row: {
  token_id: string;
  connection_id: string;
  token_hash: string;
  scopes: string;
  valid_until: string | null;
  created_at: string;
  last_used_at: string | null;
}): ScimToken {
  return {
    token_id: row.token_id,
    connection_id: row.connection_id,
    token_hash: row.token_hash,
    scopes: parseScopes(row.scopes),
    valid_until: row.valid_until ?? undefined,
    created_at: row.created_at,
    last_used_at: row.last_used_at ?? undefined,
  };
}

export function createScimTokensAdapter(
  db: Kysely<Database>,
): ScimTokensAdapter {
  return {
    async create(
      tenant_id: string,
      input: ScimTokenInsert,
    ): Promise<ScimToken> {
      const now = new Date().toISOString();
      await db
        .insertInto("scim_tokens")
        .values({
          token_id: input.token_id,
          tenant_id,
          connection_id: input.connection_id,
          token_hash: input.token_hash,
          scopes: JSON.stringify(input.scopes),
          valid_until: input.valid_until ?? null,
          created_at: now,
          last_used_at: null,
        })
        .execute();

      return {
        token_id: input.token_id,
        connection_id: input.connection_id,
        token_hash: input.token_hash,
        scopes: input.scopes,
        valid_until: input.valid_until,
        created_at: now,
      };
    },

    async get(tenant_id: string, token_id: string): Promise<ScimToken | null> {
      const row = await db
        .selectFrom("scim_tokens")
        .where("tenant_id", "=", tenant_id)
        .where("token_id", "=", token_id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToToken(row) : null;
    },

    async getByHash(
      tenant_id: string,
      token_hash: string,
    ): Promise<ScimToken | null> {
      const row = await db
        .selectFrom("scim_tokens")
        .where("tenant_id", "=", tenant_id)
        .where("token_hash", "=", token_hash)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToToken(row) : null;
    },

    async listByConnection(
      tenant_id: string,
      connection_id: string,
    ): Promise<ScimToken[]> {
      const rows = await db
        .selectFrom("scim_tokens")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .selectAll()
        .execute();
      return rows.map(rowToToken);
    },

    async markUsed(
      tenant_id: string,
      token_id: string,
      last_used_at: string,
    ): Promise<boolean> {
      const result = await db
        .updateTable("scim_tokens")
        .where("tenant_id", "=", tenant_id)
        .where("token_id", "=", token_id)
        .set({ last_used_at })
        .executeTakeFirst();
      return Number(result.numUpdatedRows) > 0;
    },

    async remove(tenant_id: string, token_id: string): Promise<boolean> {
      const result = await db
        .deleteFrom("scim_tokens")
        .where("tenant_id", "=", tenant_id)
        .where("token_id", "=", token_id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}

function rowToExternalId(row: {
  connection_id: string;
  external_id: string;
  user_id: string;
  created_at: string;
}): ScimExternalId {
  return {
    connection_id: row.connection_id,
    external_id: row.external_id,
    user_id: row.user_id,
    created_at: row.created_at,
  };
}

export function createScimExternalIdsAdapter(
  db: Kysely<Database>,
): ScimExternalIdsAdapter {
  return {
    async create(
      tenant_id: string,
      input: ScimExternalIdInsert,
    ): Promise<ScimExternalId> {
      const now = new Date().toISOString();
      await db
        .insertInto("scim_external_ids")
        .values({
          tenant_id,
          connection_id: input.connection_id,
          external_id: input.external_id,
          user_id: input.user_id,
          created_at: now,
        })
        .execute();

      return {
        connection_id: input.connection_id,
        external_id: input.external_id,
        user_id: input.user_id,
        created_at: now,
      };
    },

    async getByExternalId(
      tenant_id: string,
      connection_id: string,
      external_id: string,
    ): Promise<ScimExternalId | null> {
      const row = await db
        .selectFrom("scim_external_ids")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .where("external_id", "=", external_id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToExternalId(row) : null;
    },

    async getByUserId(
      tenant_id: string,
      connection_id: string,
      user_id: string,
    ): Promise<ScimExternalId | null> {
      const row = await db
        .selectFrom("scim_external_ids")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .where("user_id", "=", user_id)
        .selectAll()
        .executeTakeFirst();
      return row ? rowToExternalId(row) : null;
    },

    async remove(
      tenant_id: string,
      connection_id: string,
      user_id: string,
    ): Promise<boolean> {
      const result = await db
        .deleteFrom("scim_external_ids")
        .where("tenant_id", "=", tenant_id)
        .where("connection_id", "=", connection_id)
        .where("user_id", "=", user_id)
        .executeTakeFirst();
      return Number(result.numDeletedRows) > 0;
    },
  };
}
