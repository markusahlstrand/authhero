import { Kysely } from "kysely";
import { Database } from "../../src/db";
/**
 * Migration: Replace login_completed with state machine columns
 *
 * This migration:
 * 1. Adds state machine columns (state, state_data, failure_reason)
 * 2. Backfills state from login_completed
 * 3. Drops the login_completed column
 */
/**
 * Up migration: Replace login_completed with state columns
 */
export declare function up(db: Kysely<Database>): Promise<void>;
/**
 * Down migration: Restore login_completed from state
 */
export declare function down(db: Kysely<Database>): Promise<void>;
