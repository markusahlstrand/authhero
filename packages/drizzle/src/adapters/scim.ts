import { and, eq } from "drizzle-orm";
import type {
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
} from "@authhero/adapter-interfaces";
import { scimMappingEntrySchema } from "@authhero/adapter-interfaces";
import {
  scimConfigurations as scimConfigurationsTable,
  scimTokens as scimTokensTable,
  scimExternalIds as scimExternalIdsTable,
} from "../schema/sqlite";
import type { DrizzleDb } from "./types";

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

function rowToConfiguration(
  row: typeof scimConfigurationsTable.$inferSelect,
): ScimConfiguration {
  return {
    connection_id: row.connection_id,
    user_id_attribute: row.user_id_attribute,
    mapping: parseMapping(row.mapping),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createScimConfigurationsAdapter(
  db: DrizzleDb,
): ScimConfigurationsAdapter {
  return {
    async create(
      tenant_id: string,
      input: ScimConfigurationInsert,
    ): Promise<ScimConfiguration> {
      const now = new Date().toISOString();
      const configuration: ScimConfiguration = {
        connection_id: input.connection_id,
        user_id_attribute: input.user_id_attribute,
        mapping: input.mapping,
        created_at: now,
        updated_at: now,
      };

      await db.insert(scimConfigurationsTable).values({
        connection_id: configuration.connection_id,
        tenant_id,
        user_id_attribute: configuration.user_id_attribute,
        mapping: JSON.stringify(configuration.mapping),
        created_at: now,
        updated_at: now,
      });

      return configuration;
    },

    async get(
      tenant_id: string,
      connection_id: string,
    ): Promise<ScimConfiguration | null> {
      const rows = await db
        .select()
        .from(scimConfigurationsTable)
        .where(
          and(
            eq(scimConfigurationsTable.tenant_id, tenant_id),
            eq(scimConfigurationsTable.connection_id, connection_id),
          ),
        )
        .limit(1);
      return rows[0] ? rowToConfiguration(rows[0]) : null;
    },

    async update(
      tenant_id: string,
      connection_id: string,
      input: Partial<ScimConfigurationInsert>,
    ): Promise<boolean> {
      const before = await db
        .select({ connection_id: scimConfigurationsTable.connection_id })
        .from(scimConfigurationsTable)
        .where(
          and(
            eq(scimConfigurationsTable.tenant_id, tenant_id),
            eq(scimConfigurationsTable.connection_id, connection_id),
          ),
        )
        .limit(1);
      if (before.length === 0) return false;

      const set: Record<string, string> = {
        updated_at: new Date().toISOString(),
      };
      if (input.user_id_attribute !== undefined)
        set.user_id_attribute = input.user_id_attribute;
      if (input.mapping !== undefined)
        set.mapping = JSON.stringify(input.mapping);

      await db
        .update(scimConfigurationsTable)
        .set(set)
        .where(
          and(
            eq(scimConfigurationsTable.tenant_id, tenant_id),
            eq(scimConfigurationsTable.connection_id, connection_id),
          ),
        );
      return true;
    },

    async remove(tenant_id: string, connection_id: string): Promise<boolean> {
      const before = await db
        .select({ connection_id: scimConfigurationsTable.connection_id })
        .from(scimConfigurationsTable)
        .where(
          and(
            eq(scimConfigurationsTable.tenant_id, tenant_id),
            eq(scimConfigurationsTable.connection_id, connection_id),
          ),
        )
        .limit(1);
      if (before.length === 0) return false;

      await db
        .delete(scimConfigurationsTable)
        .where(
          and(
            eq(scimConfigurationsTable.tenant_id, tenant_id),
            eq(scimConfigurationsTable.connection_id, connection_id),
          ),
        );
      return true;
    },
  };
}

function rowToToken(row: typeof scimTokensTable.$inferSelect): ScimToken {
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

export function createScimTokensAdapter(db: DrizzleDb): ScimTokensAdapter {
  return {
    async create(
      tenant_id: string,
      input: ScimTokenInsert,
    ): Promise<ScimToken> {
      const now = new Date().toISOString();
      const token: ScimToken = {
        token_id: input.token_id,
        connection_id: input.connection_id,
        token_hash: input.token_hash,
        scopes: input.scopes,
        valid_until: input.valid_until,
        created_at: now,
      };

      await db.insert(scimTokensTable).values({
        token_id: token.token_id,
        tenant_id,
        connection_id: token.connection_id,
        token_hash: token.token_hash,
        scopes: JSON.stringify(token.scopes),
        valid_until: token.valid_until,
        created_at: now,
      });

      return token;
    },

    async get(tenant_id: string, token_id: string): Promise<ScimToken | null> {
      const rows = await db
        .select()
        .from(scimTokensTable)
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.token_id, token_id),
          ),
        )
        .limit(1);
      return rows[0] ? rowToToken(rows[0]) : null;
    },

    async getByHash(
      tenant_id: string,
      token_hash: string,
    ): Promise<ScimToken | null> {
      const rows = await db
        .select()
        .from(scimTokensTable)
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.token_hash, token_hash),
          ),
        )
        .limit(1);
      return rows[0] ? rowToToken(rows[0]) : null;
    },

    async listByConnection(
      tenant_id: string,
      connection_id: string,
    ): Promise<ScimToken[]> {
      const rows = await db
        .select()
        .from(scimTokensTable)
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.connection_id, connection_id),
          ),
        );
      return rows.map(rowToToken);
    },

    async markUsed(
      tenant_id: string,
      token_id: string,
      last_used_at: string,
    ): Promise<boolean> {
      const before = await db
        .select({ token_id: scimTokensTable.token_id })
        .from(scimTokensTable)
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.token_id, token_id),
          ),
        )
        .limit(1);
      if (before.length === 0) return false;

      await db
        .update(scimTokensTable)
        .set({ last_used_at })
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.token_id, token_id),
          ),
        );
      return true;
    },

    async remove(tenant_id: string, token_id: string): Promise<boolean> {
      const before = await db
        .select({ token_id: scimTokensTable.token_id })
        .from(scimTokensTable)
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.token_id, token_id),
          ),
        )
        .limit(1);
      if (before.length === 0) return false;

      await db
        .delete(scimTokensTable)
        .where(
          and(
            eq(scimTokensTable.tenant_id, tenant_id),
            eq(scimTokensTable.token_id, token_id),
          ),
        );
      return true;
    },
  };
}

function rowToExternalId(
  row: typeof scimExternalIdsTable.$inferSelect,
): ScimExternalId {
  return {
    connection_id: row.connection_id,
    external_id: row.external_id,
    user_id: row.user_id,
    created_at: row.created_at,
  };
}

export function createScimExternalIdsAdapter(
  db: DrizzleDb,
): ScimExternalIdsAdapter {
  return {
    async create(
      tenant_id: string,
      input: ScimExternalIdInsert,
    ): Promise<ScimExternalId> {
      const now = new Date().toISOString();
      const record: ScimExternalId = {
        connection_id: input.connection_id,
        external_id: input.external_id,
        user_id: input.user_id,
        created_at: now,
      };

      await db.insert(scimExternalIdsTable).values({
        tenant_id,
        connection_id: record.connection_id,
        external_id: record.external_id,
        user_id: record.user_id,
        created_at: now,
      });

      return record;
    },

    async getByExternalId(
      tenant_id: string,
      connection_id: string,
      external_id: string,
    ): Promise<ScimExternalId | null> {
      const rows = await db
        .select()
        .from(scimExternalIdsTable)
        .where(
          and(
            eq(scimExternalIdsTable.tenant_id, tenant_id),
            eq(scimExternalIdsTable.connection_id, connection_id),
            eq(scimExternalIdsTable.external_id, external_id),
          ),
        )
        .limit(1);
      return rows[0] ? rowToExternalId(rows[0]) : null;
    },

    async getByUserId(
      tenant_id: string,
      connection_id: string,
      user_id: string,
    ): Promise<ScimExternalId | null> {
      const rows = await db
        .select()
        .from(scimExternalIdsTable)
        .where(
          and(
            eq(scimExternalIdsTable.tenant_id, tenant_id),
            eq(scimExternalIdsTable.connection_id, connection_id),
            eq(scimExternalIdsTable.user_id, user_id),
          ),
        )
        .limit(1);
      return rows[0] ? rowToExternalId(rows[0]) : null;
    },

    async remove(
      tenant_id: string,
      connection_id: string,
      user_id: string,
    ): Promise<boolean> {
      const before = await db
        .select({ user_id: scimExternalIdsTable.user_id })
        .from(scimExternalIdsTable)
        .where(
          and(
            eq(scimExternalIdsTable.tenant_id, tenant_id),
            eq(scimExternalIdsTable.connection_id, connection_id),
            eq(scimExternalIdsTable.user_id, user_id),
          ),
        )
        .limit(1);
      if (before.length === 0) return false;

      await db
        .delete(scimExternalIdsTable)
        .where(
          and(
            eq(scimExternalIdsTable.tenant_id, tenant_id),
            eq(scimExternalIdsTable.connection_id, connection_id),
            eq(scimExternalIdsTable.user_id, user_id),
          ),
        );
      return true;
    },
  };
}
