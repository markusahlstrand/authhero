// import { Kysely } from "kysely";
// import { Database } from "@authhero/kysely-adapter";

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// export async function up(db: Kysely<Database>): Promise<void> {
//   await db.schema
//     .alterTable("logins")
//     .dropColumn("useragent")
//     .addColumn("useragent", "varchar(512)")
//     .execute();
// }

// export async function down(db: Kysely<Database>): Promise<void> {
//   await db.schema
//     .alterTable("logins")
//     .dropColumn("useragent")
//     .addColumn("useragent", "varchar(255)")
//     .execute();
// }
