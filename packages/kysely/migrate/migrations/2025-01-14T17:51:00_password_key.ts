// import { Kysely, sql } from "kysely";
// import { Database } from "@authhero/kysely-adapter";

// // eslint-disable-next-line @typescript-eslint/no-unused-vars
// export async function up(db: Kysely<Database>): Promise<void> {
//   // First drop the existing primary key
//   await sql`ALTER TABLE passwords DROP PRIMARY KEY`.execute(db);

//   // Then add the new composite primary key
//   await sql`ALTER TABLE passwords ADD PRIMARY KEY (user_id, tenant_id)`.execute(
//     db
//   );
// }

// export async function down(db: Kysely<Database>): Promise<void> {
//   // First drop the composite primary key
//   await sql`ALTER TABLE passwords DROP PRIMARY KEY`.execute(db);

//   // Then restore the original primary key on user_id
//   await sql`ALTER TABLE passwords ADD PRIMARY KEY (user_id)`.execute(db);
// }
