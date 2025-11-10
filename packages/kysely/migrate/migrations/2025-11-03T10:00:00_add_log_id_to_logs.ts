import { Kysely } from "kysely";
import { Database } from "../../src/db";

/**
 * Change logs table primary key from id to log_id
 * Note: This clears all existing logs data due to table recreation
 */
export async function up(db: Kysely<Database>): Promise<void> {
  // Drop the existing logs table
  await db.schema.dropTable("logs").ifExists().execute();

  // Recreate the logs table with log_id as primary key
  await db.schema
    .createTable("logs")
    .addColumn("log_id", "varchar(21)", (col) => col.primaryKey().notNull())
    .addColumn("category", "varchar(255)")
    .addColumn("tenant_id", "varchar(64)")
    .addColumn("user_id", "varchar(64)")
    .addColumn("ip", "varchar(255)")
    .addColumn("type", "varchar(8)", (col) => col.notNull())
    .addColumn("date", "varchar(25)", (col) => col.notNull())
    .addColumn("client_id", "varchar(255)")
    .addColumn("client_name", "varchar(255)")
    .addColumn("user_agent", "varchar(255)")
    .addColumn("description", "varchar(255)")
    .addColumn("details", "varchar(2048)")
    .addColumn("isMobile", "integer")
    .addColumn("user_name", "varchar(255)")
    .addColumn("connection", "varchar(255)")
    .addColumn("connection_id", "varchar(255)")
    .addColumn("audience", "varchar(255)")
    .addColumn("scope", "varchar(255)")
    .addColumn("strategy", "varchar(255)")
    .addColumn("strategy_type", "varchar(255)")
    .addColumn("hostname", "varchar(255)")
    .addColumn("auth0_client", "varchar(8192)")
    .addColumn("session_connection", "varchar(255)")
    .execute();
}

/**
 * Down migration: Revert to id as primary key
 */
export async function down(db: Kysely<Database>): Promise<void> {
  // Drop the logs table with new schema
  await db.schema.dropTable("logs").ifExists().execute();

  // Recreate with old schema using id as primary key
  await db.schema
    .createTable("logs")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey().notNull())
    .addColumn("category", "varchar(255)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(64)")
    .addColumn("user_id", "varchar(64)")
    .addColumn("ip", "varchar(255)")
    .addColumn("type", "varchar(8)", (col) => col.notNull())
    .addColumn("date", "varchar(25)", (col) => col.notNull())
    .addColumn("client_id", "varchar(255)")
    .addColumn("client_name", "varchar(255)")
    .addColumn("user_agent", "varchar(255)")
    .addColumn("description", "varchar(255)")
    .addColumn("details", "varchar(2048)")
    .execute();
}
