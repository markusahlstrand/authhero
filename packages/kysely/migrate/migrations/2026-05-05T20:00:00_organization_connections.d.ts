import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Junction table linking organizations to tenant-level connections, mirroring
 * Auth0's `/api/v2/organizations/{id}/enabled_connections`. Uniqueness is on
 * (tenant_id, organization_id, connection_id) — a connection can be enabled
 * once per org, with per-org policy flags.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
