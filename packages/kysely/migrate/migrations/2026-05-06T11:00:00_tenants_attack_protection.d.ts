import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Adds a nullable JSON column on `tenants` that stores Auth0's
 * /api/v2/attack-protection sub-resources (breached_password_detection,
 * brute_force_protection, suspicious_ip_throttling). Singleton per tenant —
 * no separate table.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
