import { Migration, MigrationProvider } from "kysely";
export default class ReferenceMigrationProvider implements MigrationProvider {
  migrations: Record<string, Migration>;
  constructor(migrations: Record<string, Migration>);
  getMigrations(): Promise<Record<string, Migration>>;
}
