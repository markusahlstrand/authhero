import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable("refresh_tokens")
        .addColumn("login_id", "varchar(26)")
        .execute();

    await db.schema
        .createIndex("idx_refresh_tokens_login_id")
        .on("refresh_tokens")
        .column("login_id")
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex("idx_refresh_tokens_login_id").execute();
    await db.schema
        .alterTable("refresh_tokens")
        .dropColumn("login_id")
        .execute();
}
