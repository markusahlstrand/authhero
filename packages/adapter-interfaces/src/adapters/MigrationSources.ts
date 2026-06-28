import {
  MigrationSource,
  MigrationSourceInsert,
} from "../types/MigrationSource";
import { CreateOptions } from "../types/ImportMetadata";

export interface MigrationSourcesAdapter {
  create: (
    tenant_id: string,
    migration_source: MigrationSourceInsert,
    options?: CreateOptions,
  ) => Promise<MigrationSource>;
  get: (tenant_id: string, id: string) => Promise<MigrationSource | null>;
  list: (tenant_id: string) => Promise<MigrationSource[]>;
  remove: (tenant_id: string, id: string) => Promise<boolean>;
  update: (
    tenant_id: string,
    id: string,
    migration_source: Partial<MigrationSourceInsert>,
  ) => Promise<boolean>;
}
