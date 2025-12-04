import { Kysely } from "kysely";
import { Database } from "../../src/db";
import { sql } from "kysely";

export async function up(db: Kysely<Database>): Promise<void> {
  // For SQLite, we need to recreate the table to change primary key
  // Create new table with new schema
  await sql`
    CREATE TABLE passwords_new (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      password TEXT NOT NULL,
      algorithm TEXT NOT NULL DEFAULT 'argon2id',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      is_current INTEGER NOT NULL DEFAULT 1
    )
  `.execute(db);

  // Copy data from old table, generating UUIDs for id
  await sql`
    INSERT INTO passwords_new (id, user_id, tenant_id, password, algorithm, created_at, updated_at, is_current)
    SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6))) as id,
           user_id, tenant_id, password, 'argon2id' as algorithm, created_at, created_at as updated_at, 1 as is_current
    FROM passwords
  `.execute(db);

  // Drop old table
  await sql`DROP TABLE passwords`.execute(db);

  // Rename new table
  await sql`ALTER TABLE passwords_new RENAME TO passwords`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Recreate old table
  await sql`
    CREATE TABLE passwords_new (
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      password TEXT NOT NULL,
      algorithm TEXT NOT NULL DEFAULT 'argon2id',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, tenant_id)
    )
  `.execute(db);

  // Copy data, taking only is_current = 1
  await sql`
    INSERT INTO passwords_new (user_id, tenant_id, password, algorithm, created_at, updated_at)
    SELECT user_id, tenant_id, password, algorithm, created_at, updated_at
    FROM passwords
    WHERE is_current = 1
  `.execute(db);

  // Drop new table
  await sql`DROP TABLE passwords`.execute(db);

  // Rename
  await sql`ALTER TABLE passwords_new RENAME TO passwords`.execute(db);
}
