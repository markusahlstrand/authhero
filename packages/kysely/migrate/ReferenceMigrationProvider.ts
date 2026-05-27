import { Migration, MigrationProvider } from "kysely/migration";

export default class ReferenceMigrationProvider implements MigrationProvider {
  migrations: Record<string, Migration>;

  constructor(migrations: Record<string, Migration>) {
    this.migrations = migrations;
  }

  async getMigrations(): Promise<Record<string, Migration>> {
    return this.migrations;
  }
}
