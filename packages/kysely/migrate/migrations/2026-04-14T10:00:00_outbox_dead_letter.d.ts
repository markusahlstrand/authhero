import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Up migration: Add dead-letter columns to outbox_events.
 *
 * When an outbox event exhausts its retry budget, the relay marks it as
 * dead-lettered (processed_at is also set so it is excluded from relay
 * queries). The `final_error` column preserves the last failure for admin
 * investigation and the `dead_lettered_at` column lets the failed-events
 * management endpoints filter and order by dead-letter time.
 */
export declare function up(db: Kysely<Database>): Promise<void>;
export declare function down(db: Kysely<Database>): Promise<void>;
