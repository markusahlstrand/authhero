import { Kysely } from "kysely";
import { nanoid } from "nanoid";
import { Database } from "../../src/db";

const CHUNK_SIZE = 1000;

export async function up(db: Kysely<Database>): Promise<void> {
  // 1. Create new password_history table with the new schema
  await db.schema
    .createTable("password_history")
    .addColumn("id", "varchar(21)", (col) => col.primaryKey())
    .addColumn("user_id", "varchar(191)", (col) => col.notNull())
    .addColumn("tenant_id", "varchar(191)", (col) =>
      col.references("tenants.id").onDelete("cascade").notNull(),
    )
    .addColumn("password", "varchar(255)", (col) => col.notNull())
    .addColumn("algorithm", "varchar(255)", (col) =>
      col.notNull().defaultTo("bcrypt"),
    )
    .addColumn("created_at", "varchar(35)", (col) => col.notNull())
    .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
    .addColumn("is_current", "integer", (col) => col.notNull().defaultTo(1))
    .addForeignKeyConstraint(
      "password_history_user_id_tenant_id_constraint",
      ["user_id", "tenant_id"],
      "users",
      ["user_id", "tenant_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // 2. Migrate existing data from passwords table in chunks
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const existingPasswords = await (db as any)
      .selectFrom("passwords")
      .select([
        "user_id",
        "tenant_id",
        "password",
        "algorithm",
        "created_at",
        "updated_at",
      ])
      .limit(CHUNK_SIZE)
      .offset(offset)
      .execute();

    if (existingPasswords.length === 0) {
      hasMore = false;
      break;
    }

    for (const pwd of existingPasswords) {
      await (db as any)
        .insertInto("password_history")
        .values({
          id: nanoid(),
          user_id: pwd.user_id,
          tenant_id: pwd.tenant_id,
          password: pwd.password,
          algorithm: pwd.algorithm ?? "bcrypt",
          created_at: pwd.created_at,
          updated_at: pwd.updated_at ?? pwd.created_at,
          is_current: 1,
        })
        .execute();
    }

    offset += CHUNK_SIZE;

    if (existingPasswords.length < CHUNK_SIZE) {
      hasMore = false;
    }
  }

  // 3. Rename the old passwords table (keep it as backup in case anything goes wrong)
  await db.schema
    .alterTable("passwords")
    .renameTo("passwords_backup")
    .execute();

  // 4. Rename password_history to passwords
  await db.schema
    .alterTable("password_history")
    .renameTo("passwords")
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  // 1. Rename current passwords table
  await db.schema
    .alterTable("passwords")
    .renameTo("password_history")
    .execute();

  // 2. Check if backup table exists and restore it
  try {
    await db.schema
      .alterTable("passwords_backup")
      .renameTo("passwords")
      .execute();
  } catch {
    // Backup table doesn't exist, need to recreate from password_history
    await db.schema
      .createTable("passwords")
      .addColumn("user_id", "varchar(255)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(255)", (col) =>
        col.references("tenants.id").onDelete("cascade").notNull(),
      )
      .addColumn("password", "varchar(255)", (col) => col.notNull())
      .addColumn("algorithm", "varchar(255)", (col) =>
        col.notNull().defaultTo("bcrypt"),
      )
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
      .addPrimaryKeyConstraint("passwords_pkey", ["user_id", "tenant_id"])
      .addForeignKeyConstraint(
        "passwords_user_id_tenant_id_constraint",
        ["user_id", "tenant_id"],
        "users",
        ["user_id", "tenant_id"],
        (cb) => cb.onDelete("cascade"),
      )
      .execute();

    // Migrate only current passwords back in chunks
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const currentPasswords = await (db as any)
        .selectFrom("password_history")
        .select([
          "user_id",
          "tenant_id",
          "password",
          "algorithm",
          "created_at",
          "updated_at",
        ])
        .where("is_current", "=", 1)
        .limit(CHUNK_SIZE)
        .offset(offset)
        .execute();

      if (currentPasswords.length === 0) {
        hasMore = false;
        break;
      }

      for (const pwd of currentPasswords) {
        await (db as any)
          .insertInto("passwords")
          .values({
            user_id: pwd.user_id,
            tenant_id: pwd.tenant_id,
            password: pwd.password,
            algorithm: pwd.algorithm,
            created_at: pwd.created_at,
            updated_at: pwd.updated_at,
          })
          .execute();
      }

      offset += CHUNK_SIZE;

      if (currentPasswords.length < CHUNK_SIZE) {
        hasMore = false;
      }
    }
  }

  // 3. Drop the password_history table
  await db.schema.dropTable("password_history").execute();
}
