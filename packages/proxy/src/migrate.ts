import { Kysely } from "kysely";
import {
  Migration,
  MigrationProvider,
  Migrator,
} from "kysely/migration";
import migrations from "./migrations";

const MIGRATION_TABLE = "kysely_migration_proxy";
const MIGRATION_LOCK_TABLE = "kysely_migration_proxy_lock";

class StaticMigrationProvider implements MigrationProvider {
  constructor(private readonly migrations: Record<string, Migration>) {}
  async getMigrations(): Promise<Record<string, Migration>> {
    return this.migrations;
  }
}

function buildMigrator<DB>(db: Kysely<DB>): Migrator {
  return new Migrator({
    db: db as Kysely<unknown>,
    provider: new StaticMigrationProvider(migrations),
    migrationTableName: MIGRATION_TABLE,
    migrationLockTableName: MIGRATION_LOCK_TABLE,
  });
}

export async function runMigrations<DB>(
  db: Kysely<DB>,
  options: { debug?: boolean } = {},
): Promise<void> {
  const migrator = buildMigrator(db);
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((it) => {
    if (it.status === "Success" && options.debug) {
      console.log(`proxy migration "${it.migrationName}" executed`);
    } else if (it.status === "Error") {
      console.error(`proxy migration "${it.migrationName}" failed`);
    }
  });
  if (error) {
    console.error("proxy migrations failed:", error);
    throw error;
  }
}

export async function migrateDown<DB>(
  db: Kysely<DB>,
  options: { debug?: boolean } = {},
): Promise<void> {
  const migrator = buildMigrator(db);
  const { error, results } = await migrator.migrateDown();
  results?.forEach((it) => {
    if (it.status === "Success" && options.debug) {
      console.log(`proxy migration "${it.migrationName}" reverted`);
    } else if (it.status === "Error") {
      console.error(`proxy migration "${it.migrationName}" rollback failed`);
    }
  });
  if (error) {
    console.error("proxy migrations rollback failed:", error);
    throw error;
  }
}
