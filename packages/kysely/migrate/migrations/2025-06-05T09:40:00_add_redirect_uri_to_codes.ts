import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("codes")
    .addColumn("redirect_uri", "varchar(1024)")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("codes").dropColumn("redirect_uri").execute();
}
