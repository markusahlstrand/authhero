import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  // Add mfa column to tenants table for Guardian MFA configuration
  await db.schema
    .alterTable("tenants")
    .addColumn("mfa", "text") // JSON storing MFA factors and provider configurations
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("tenants").dropColumn("mfa").execute();
}
