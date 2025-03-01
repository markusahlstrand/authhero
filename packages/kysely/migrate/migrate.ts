import { Kysely, Migrator } from "kysely";

import ReferenceMigrationProvider from "./ReferenceMigrationProvider";
import migrations from "./migrations";
import { Database } from "../src/db";

export async function migrateToLatest(db: Kysely<Database>, debug = false) {
  if (debug) {
    console.log("migrating...");
  }

  const provider = new ReferenceMigrationProvider(migrations);

  const migrator = new Migrator({
    db,
    provider,
  });
  const { error, results } = await migrator.migrateToLatest();
  results?.forEach((it) => {
    if (it.status === "Success") {
      if (debug) {
        console.log(
          `migration "${it.migrationName}" was executed successfully`,
        );
      }
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });
  if (error) {
    console.error("failed to migrate");
    console.error(error);
    throw error;
  }
}

export async function migrateDown(db: Kysely<Database>) {
  console.log("migrating...");

  const provider = new ReferenceMigrationProvider(migrations);
  const migrator = new Migrator({
    db,
    provider,
  });
  const { error, results } = await migrator.migrateDown();
  results?.forEach((it) => {
    if (it.status === "Success") {
      console.log(`migration "${it.migrationName}" was reverted successfully`);
    } else if (it.status === "Error") {
      console.error(`failed to execute migration "${it.migrationName}"`);
    }
  });
  if (error) {
    console.error("failed to migrate");
    console.error(error);
    throw error;
  }
}
