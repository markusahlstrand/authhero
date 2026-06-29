import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import {
  MigrationSource,
  MigrationSourceInsert,
  MigrationSourceCredentials,
  MigrationSourcesAdapter,
  migrationProviderTypeSchema,
  CreateOptions,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

type Row = Database["migration_sources"];

function fromRow(row: Row): MigrationSource {
  return {
    id: row.id,
    name: row.name,
    provider: migrationProviderTypeSchema.parse(row.provider),
    connection: row.connection,
    enabled: row.enabled === 1,
    credentials: JSON.parse(row.credentials) as MigrationSourceCredentials,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createMigrationSourcesAdapter(
  db: Kysely<Database>,
): MigrationSourcesAdapter {
  return {
    async create(
      tenant_id: string,
      params: MigrationSourceInsert,
      options?: CreateOptions,
    ): Promise<MigrationSource> {
      const importMetadata = options?.importMetadata;
      const now = new Date().toISOString();
      const id = importMetadata?.id ?? params.id ?? `mig_${nanoid()}`;
      const enabled = params.enabled ?? true;
      const row: Row = {
        id,
        tenant_id,
        name: params.name,
        provider: params.provider,
        connection: params.connection,
        enabled: enabled ? 1 : 0,
        credentials: JSON.stringify(params.credentials),
        created_at: importMetadata?.created_at ?? now,
        updated_at: importMetadata?.updated_at ?? now,
      };
      await db.insertInto("migration_sources").values(row).execute();
      return fromRow(row);
    },

    async get(tenant_id, id) {
      const row = await db
        .selectFrom("migration_sources")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .selectAll()
        .executeTakeFirst();
      return row ? fromRow(row) : null;
    },

    async list(tenant_id) {
      const rows = await db
        .selectFrom("migration_sources")
        .where("tenant_id", "=", tenant_id)
        .selectAll()
        .execute();
      return rows.map(fromRow);
    },

    async update(tenant_id, id, params) {
      const patch: Partial<Row> = { updated_at: new Date().toISOString() };
      if (params.name !== undefined) patch.name = params.name;
      if (params.provider !== undefined) patch.provider = params.provider;
      if (params.connection !== undefined) patch.connection = params.connection;
      if (params.enabled !== undefined) patch.enabled = params.enabled ? 1 : 0;
      if (params.credentials !== undefined) {
        patch.credentials = JSON.stringify(params.credentials);
      }

      const result = await db
        .updateTable("migration_sources")
        .set(patch)
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result?.numUpdatedRows ?? 0n) > 0n;
    },

    async remove(tenant_id, id) {
      const result = await db
        .deleteFrom("migration_sources")
        .where("tenant_id", "=", tenant_id)
        .where("id", "=", id)
        .executeTakeFirst();
      return (result?.numDeletedRows ?? 0n) > 0n;
    },
  };
}
