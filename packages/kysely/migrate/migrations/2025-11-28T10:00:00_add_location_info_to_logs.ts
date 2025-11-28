import { Kysely } from "kysely";
import { Database } from "../../src/db";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("logs")
    .addColumn("country_code", "varchar(2)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("country_code3", "varchar(3)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("country_name", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("city_name", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("latitude", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("longitude", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("time_zone", "varchar(255)")
    .execute();
  await db.schema
    .alterTable("logs")
    .addColumn("continent_code", "varchar(2)")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("logs").dropColumn("country_code").execute();
  await db.schema.alterTable("logs").dropColumn("country_code3").execute();
  await db.schema.alterTable("logs").dropColumn("country_name").execute();
  await db.schema.alterTable("logs").dropColumn("city_name").execute();
  await db.schema.alterTable("logs").dropColumn("latitude").execute();
  await db.schema.alterTable("logs").dropColumn("longitude").execute();
  await db.schema.alterTable("logs").dropColumn("time_zone").execute();
  await db.schema.alterTable("logs").dropColumn("continent_code").execute();
}
