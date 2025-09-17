import { Kysely, sql } from "kysely";
import { Database } from "../../src/db";

// Helper function to detect database type
async function getDatabaseType(
  db: Kysely<Database>,
): Promise<"mysql" | "sqlite"> {
  try {
    // Try MySQL-specific query
    await sql`SELECT VERSION()`.execute(db);
    return "mysql";
  } catch {
    // If MySQL query fails, assume SQLite
    return "sqlite";
  }
}

/**
 * Up migration: Updates foreign key constraints to reference the new clients table
 * instead of the applications table.
 * Supports both MySQL/PlanetScale and SQLite databases.
 *
 * Also takes the opportunity to:
 * - Add composite primary keys (tenant_id, id) to improve multi-tenant performance
 * - Upgrade problematic varchar fields to text type for better length handling:
 *   - authParams_state, authParams_redirect_uri, authorization_url in login_sessions
 *   - resource_servers, device in refresh_tokens
 *   - useragent in login_sessions
 */
export async function up(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType === "mysql") {
    await upMySQL(db);
  } else {
    await upSQLite(db);
  }
}

async function upMySQL(db: Kysely<Database>): Promise<void> {
  // For MySQL/PlanetScale, we need to handle foreign key constraints properly
  // The approach is to drop constraints, backup data, drop tables, then recreate them

  // Wrap the entire migration in a transaction to ensure atomicity
  await db.transaction().execute(async (trx) => {
    // Step 1: Drop foreign key constraints that would prevent table drops
    // Use INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS to find actual foreign keys

    const foreignKeys = await sql`
      SELECT 
        rc.CONSTRAINT_NAME,
        rc.TABLE_NAME
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND rc.TABLE_NAME IN ('refresh_tokens', 'sessions', 'login_sessions')
    `.execute(trx);

    // Drop each foreign key constraint found
    for (const row of foreignKeys.rows) {
      const constraintName = (row as any).CONSTRAINT_NAME;
      const tableName = (row as any).TABLE_NAME;
      try {
        await sql`ALTER TABLE ${sql.raw(tableName)} DROP FOREIGN KEY ${sql.raw(constraintName)}`.execute(
          trx,
        );
        console.log(
          `Dropped foreign key constraint ${constraintName} from ${tableName}`,
        );
      } catch (error) {
        console.warn(
          `Failed to drop constraint ${constraintName} from ${tableName}:`,
          error,
        );
        // Continue with migration even if constraint drop fails
      }
    }

    // Step 2: Clean up any existing backup tables from previous failed runs
    const backupTables = [
      "sessions_backup",
      "login_sessions_backup",
      "refresh_tokens_backup",
    ];

    for (const tableName of backupTables) {
      try {
        await sql`DROP TABLE IF EXISTS ${sql.raw(tableName)}`.execute(trx);
      } catch (error) {
        console.warn(`Failed to drop backup table ${tableName}:`, error);
      }
    }

    // Step 3: Backup existing data
    await sql`CREATE TABLE sessions_backup AS SELECT * FROM sessions`.execute(
      trx,
    );
    await sql`CREATE TABLE login_sessions_backup AS SELECT * FROM login_sessions`.execute(
      trx,
    );
    await sql`CREATE TABLE refresh_tokens_backup AS SELECT * FROM refresh_tokens`.execute(
      trx,
    );

    // Step 4: Drop tables (now safe since foreign keys are dropped)
    await sql`DROP TABLE sessions`.execute(trx);
    await sql`DROP TABLE login_sessions`.execute(trx);
    await sql`DROP TABLE refresh_tokens`.execute(trx);

    // Step 5: Create new refresh_tokens table with correct foreign key and composite primary key
    await trx.schema
      .createTable("refresh_tokens")
      .addColumn("id", "varchar(21)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
      .addColumn("client_id", "varchar(191)", (col) => col.notNull())
      .addColumn("session_id", "varchar(21)", (col) => col.notNull())
      .addColumn("user_id", "varchar(255)")
      .addColumn("resource_servers", "text", (col) => col.notNull())
      .addColumn("device", "text", (col) => col.notNull())
      .addColumn("rotating", "boolean", (col) => col.notNull())
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)")
      .addColumn("idle_expires_at", "varchar(35)")
      .addColumn("last_exchanged_at", "varchar(35)")
      .addPrimaryKeyConstraint("refresh_tokens_pk", ["tenant_id", "id"])
      .execute();

    // Add foreign key constraints separately for refresh_tokens
    await sql`ALTER TABLE refresh_tokens 
      ADD CONSTRAINT refresh_tokens_tenant_fk 
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`.execute(
      trx,
    );

    await sql`ALTER TABLE refresh_tokens 
      ADD CONSTRAINT refresh_tokens_client_fk 
      FOREIGN KEY (tenant_id, client_id) REFERENCES clients(tenant_id, client_id) ON DELETE CASCADE`.execute(
      trx,
    );

    // Step 6: Create new sessions table with composite primary key
    await trx.schema
      .createTable("sessions")
      .addColumn("id", "varchar(21)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
      .addColumn("user_id", "varchar(255)")
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)")
      .addColumn("idle_expires_at", "varchar(35)")
      .addColumn("authenticated_at", "varchar(35)")
      .addColumn("last_interaction_at", "varchar(35)")
      .addColumn("used_at", "varchar(35)")
      .addColumn("revoked_at", "varchar(35)")
      .addColumn("device", "text", (col) => col.notNull())
      .addColumn("clients", "text", (col) => col.notNull())
      .addColumn("login_session_id", "varchar(21)")
      .addPrimaryKeyConstraint("sessions_pk", ["tenant_id", "id"])
      .execute();

    // Add foreign key constraints separately for sessions
    await sql`ALTER TABLE sessions 
      ADD CONSTRAINT sessions_user_fk 
      FOREIGN KEY (user_id, tenant_id) REFERENCES users(user_id, tenant_id) ON DELETE CASCADE`.execute(
      trx,
    );

    // Step 7: Create new login_sessions table with composite primary key (no circular foreign key)
    await trx.schema
      .createTable("login_sessions")
      .addColumn("id", "varchar(21)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
      .addColumn("session_id", "varchar(21)")
      .addColumn("csrf_token", "varchar(21)", (col) => col.notNull())
      .addColumn("authParams_client_id", "varchar(191)", (col) => col.notNull())
      .addColumn("authParams_vendor_id", "varchar(255)")
      .addColumn("authParams_username", "varchar(255)")
      .addColumn("authParams_response_type", "varchar(255)")
      .addColumn("authParams_response_mode", "varchar(255)")
      .addColumn("authParams_audience", "varchar(255)")
      .addColumn("authParams_scope", "text")
      .addColumn("authParams_state", "text")
      .addColumn("authParams_nonce", "varchar(255)")
      .addColumn("authParams_code_challenge_method", "varchar(255)")
      .addColumn("authParams_code_challenge", "varchar(255)")
      .addColumn("authParams_redirect_uri", "text")
      .addColumn("authParams_organization", "varchar(255)")
      .addColumn("authParams_prompt", "varchar(32)")
      .addColumn("authParams_act_as", "varchar(256)")
      .addColumn("authParams_ui_locales", "varchar(32)")
      .addColumn("authorization_url", "text")
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)", (col) => col.notNull())
      .addColumn("ip", "varchar(39)")
      .addColumn("useragent", "text")
      .addColumn("auth0Client", "varchar(255)")
      .addColumn("login_completed", "integer", (col) => col.defaultTo(0))
      .addPrimaryKeyConstraint("login_sessions_pk", ["tenant_id", "id"])
      .execute();

    // Add foreign key constraints separately for login_sessions
    await sql`ALTER TABLE login_sessions 
      ADD CONSTRAINT login_sessions_tenant_fk 
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE`.execute(
      trx,
    );

    await sql`ALTER TABLE login_sessions 
      ADD CONSTRAINT login_sessions_client_fk 
      FOREIGN KEY (tenant_id, authParams_client_id) REFERENCES clients(tenant_id, client_id) ON DELETE CASCADE`.execute(
      trx,
    );

    await sql`ALTER TABLE login_sessions 
      ADD CONSTRAINT login_sessions_session_fk 
      FOREIGN KEY (tenant_id, session_id) REFERENCES sessions(tenant_id, id) ON DELETE CASCADE`.execute(
      trx,
    );

    // Step 8: Restore data from backups
    await sql`INSERT INTO refresh_tokens 
      SELECT id, tenant_id, client_id, session_id, user_id, resource_servers, device, rotating, 
             created_at, expires_at, idle_expires_at, last_exchanged_at
      FROM refresh_tokens_backup`.execute(trx);

    await sql`INSERT INTO sessions 
      SELECT id, tenant_id, user_id, created_at, updated_at, expires_at, idle_expires_at,
             authenticated_at, last_interaction_at, used_at, revoked_at, device, clients, login_session_id
      FROM sessions_backup`.execute(trx);

    await sql`INSERT INTO login_sessions 
      SELECT id, tenant_id, session_id, csrf_token, authParams_client_id, authParams_vendor_id, authParams_username, 
             authParams_response_type, authParams_response_mode, authParams_audience, authParams_scope, authParams_state, 
             authParams_nonce, authParams_code_challenge_method, authParams_code_challenge, authParams_redirect_uri, 
             authParams_organization, authParams_prompt, authParams_act_as, authParams_ui_locales, authorization_url,
             created_at, updated_at, expires_at, ip, useragent, auth0Client, login_completed
      FROM login_sessions_backup`.execute(trx);

    // Step 9: Clean up backup tables
    await sql`DROP TABLE sessions_backup`.execute(trx);
    await sql`DROP TABLE login_sessions_backup`.execute(trx);
    await sql`DROP TABLE refresh_tokens_backup`.execute(trx);

    // Note: We removed the foreign key constraint from sessions.login_session_id to login_sessions
    // because login_sessions now has a composite primary key and the relationship is optional (SET NULL).
    // The application logic handles the relationship validation.
    // Note: tickets table was dropped in a previous migration (2024-12-05T13:05:00_drop_tickets).
  });
}

async function upSQLite(db: Kysely<Database>): Promise<void> {
  // For SQLite, we use the original approach of recreating tables
  // SQLite doesn't support ALTER TABLE for foreign key constraints

  // Wrap the entire migration in a transaction to ensure atomicity
  await db.transaction().execute(async (trx) => {
    // Step 1: Clean up any existing backup tables from previous failed runs
    const backupTables = [
      "sessions_backup",
      "login_sessions_backup",
      "refresh_tokens_backup",
    ];

    for (const tableName of backupTables) {
      try {
        await sql`DROP TABLE IF EXISTS ${sql.raw(tableName)}`.execute(trx);
      } catch (error) {
        console.warn(`Failed to drop backup table ${tableName}:`, error);
      }
    }

    // Step 2: Backup existing data
    await sql`CREATE TABLE sessions_backup AS SELECT * FROM sessions`.execute(
      trx,
    );
    await sql`CREATE TABLE login_sessions_backup AS SELECT * FROM login_sessions`.execute(
      trx,
    );
    await sql`CREATE TABLE refresh_tokens_backup AS SELECT * FROM refresh_tokens`.execute(
      trx,
    );

    // Step 3: Drop tables with foreign key dependencies (in correct order)
    await sql`DROP TABLE sessions`.execute(trx);
    await sql`DROP TABLE login_sessions`.execute(trx);
    await sql`DROP TABLE refresh_tokens`.execute(trx);

    // Step 4: Create new refresh_tokens table with correct foreign key and composite primary key
    await trx.schema
      .createTable("refresh_tokens")
      .addColumn("id", "varchar(21)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(255)", (col) =>
        col.references("tenants.id").onDelete("cascade").notNull(),
      )
      .addColumn("client_id", "varchar(191)", (col) => col.notNull())
      .addColumn("session_id", "varchar(21)", (col) => col.notNull())
      .addColumn("user_id", "varchar(255)")
      .addColumn("resource_servers", "text", (col) => col.notNull())
      .addColumn("device", "text", (col) => col.notNull())
      .addColumn("rotating", "boolean", (col) => col.notNull())
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)")
      .addColumn("idle_expires_at", "varchar(35)")
      .addColumn("last_exchanged_at", "varchar(35)")
      .addPrimaryKeyConstraint("refresh_tokens_pk", ["tenant_id", "id"])
      .addForeignKeyConstraint(
        "refresh_tokens_client_fk",
        ["tenant_id", "client_id"],
        "clients",
        ["tenant_id", "client_id"],
        (cb) => cb.onDelete("cascade"),
      )
      .execute();

    // Step 5: Create new sessions table with composite primary key
    await trx.schema
      .createTable("sessions")
      .addColumn("id", "varchar(21)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(191)", (col) => col.notNull())
      .addColumn("user_id", "varchar(255)")
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)")
      .addColumn("idle_expires_at", "varchar(35)")
      .addColumn("authenticated_at", "varchar(35)")
      .addColumn("last_interaction_at", "varchar(35)")
      .addColumn("used_at", "varchar(35)")
      .addColumn("revoked_at", "varchar(35)")
      .addColumn("device", "text", (col) => col.notNull())
      .addColumn("clients", "text", (col) => col.notNull())
      .addColumn("login_session_id", "varchar(21)")
      .addPrimaryKeyConstraint("sessions_pk", ["tenant_id", "id"])
      .addForeignKeyConstraint(
        "sessions_user_fk",
        ["user_id", "tenant_id"],
        "users",
        ["user_id", "tenant_id"],
        (cb) => cb.onDelete("cascade"),
      )
      .execute();

    // Step 6: Create new login_sessions table with composite primary key (no circular foreign key)
    await trx.schema
      .createTable("login_sessions")
      .addColumn("id", "varchar(21)", (col) => col.notNull())
      .addColumn("tenant_id", "varchar(255)", (col) =>
        col.references("tenants.id").onDelete("cascade").notNull(),
      )
      .addColumn("session_id", "varchar(21)")
      .addColumn("csrf_token", "varchar(21)", (col) => col.notNull())
      .addColumn("authParams_client_id", "varchar(191)", (col) => col.notNull())
      .addColumn("authParams_vendor_id", "varchar(255)")
      .addColumn("authParams_username", "varchar(255)")
      .addColumn("authParams_response_type", "varchar(255)")
      .addColumn("authParams_response_mode", "varchar(255)")
      .addColumn("authParams_audience", "varchar(255)")
      .addColumn("authParams_scope", "text")
      .addColumn("authParams_state", "text")
      .addColumn("authParams_nonce", "varchar(255)")
      .addColumn("authParams_code_challenge_method", "varchar(255)")
      .addColumn("authParams_code_challenge", "varchar(255)")
      .addColumn("authParams_redirect_uri", "text")
      .addColumn("authParams_organization", "varchar(255)")
      .addColumn("authParams_prompt", "varchar(32)")
      .addColumn("authParams_act_as", "varchar(256)")
      .addColumn("authParams_ui_locales", "varchar(32)")
      .addColumn("authorization_url", "text")
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("updated_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)", (col) => col.notNull())
      .addColumn("ip", "varchar(39)")
      .addColumn("useragent", "text")
      .addColumn("auth0Client", "varchar(255)")
      .addColumn("login_completed", "integer", (col) => col.defaultTo(0))
      .addPrimaryKeyConstraint("login_sessions_pk", ["tenant_id", "id"])
      .addForeignKeyConstraint(
        "login_sessions_client_fk",
        ["tenant_id", "authParams_client_id"],
        "clients",
        ["tenant_id", "client_id"],
        (cb) => cb.onDelete("cascade"),
      )
      .addForeignKeyConstraint(
        "login_sessions_session_fk",
        ["tenant_id", "session_id"],
        "sessions",
        ["tenant_id", "id"],
        (cb) => cb.onDelete("cascade"),
      )
      .execute();

    // Step 7: Restore data from backups
    await sql`INSERT INTO refresh_tokens 
      SELECT id, tenant_id, client_id, session_id, user_id, resource_servers, device, rotating, 
             created_at, expires_at, idle_expires_at, last_exchanged_at
      FROM refresh_tokens_backup`.execute(trx);

    await sql`INSERT INTO sessions 
      SELECT id, tenant_id, user_id, created_at, updated_at, expires_at, idle_expires_at,
             authenticated_at, last_interaction_at, used_at, revoked_at, device, clients, login_session_id
      FROM sessions_backup`.execute(trx);

    await sql`INSERT INTO login_sessions 
      SELECT id, tenant_id, session_id, csrf_token, authParams_client_id, authParams_vendor_id, authParams_username, 
             authParams_response_type, authParams_response_mode, authParams_audience, authParams_scope, authParams_state, 
             authParams_nonce, authParams_code_challenge_method, authParams_code_challenge, authParams_redirect_uri, 
             authParams_organization, authParams_prompt, authParams_act_as, authParams_ui_locales, authorization_url,
             created_at, updated_at, expires_at, ip, useragent, auth0Client, login_completed
      FROM login_sessions_backup`.execute(trx);

    // Step 8: Clean up backup tables
    await sql`DROP TABLE sessions_backup`.execute(trx);
    await sql`DROP TABLE login_sessions_backup`.execute(trx);
    await sql`DROP TABLE refresh_tokens_backup`.execute(trx);

    // Note: We removed the foreign key constraint from sessions.login_session_id to login_sessions
    // because login_sessions now has a composite primary key and the relationship is optional (SET NULL).
    // The application logic handles the relationship validation.
  });
}

/**
 * Down migration: Reverts foreign key constraints back to reference applications table.
 * NOTE: This is a destructive operation and may cause data loss.
 */
export async function down(db: Kysely<Database>): Promise<void> {
  const dbType = await getDatabaseType(db);

  if (dbType === "mysql") {
    await downMySQL(db);
  } else {
    await downSQLite(db);
  }
}

async function downMySQL(db: Kysely<Database>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    // Drop foreign key constraints that reference clients table
    await sql`ALTER TABLE refresh_tokens DROP FOREIGN KEY refresh_tokens_client_fk`.execute(
      trx,
    );
    await sql`ALTER TABLE login_sessions DROP FOREIGN KEY login_sessions_client_fk`.execute(
      trx,
    );

    // Drop composite primary keys and revert to single column primary keys
    await sql`ALTER TABLE refresh_tokens DROP PRIMARY KEY`.execute(trx);
    await sql`ALTER TABLE refresh_tokens ADD PRIMARY KEY (id)`.execute(trx);

    await sql`ALTER TABLE sessions DROP PRIMARY KEY`.execute(trx);
    await sql`ALTER TABLE sessions ADD PRIMARY KEY (id)`.execute(trx);

    await sql`ALTER TABLE login_sessions DROP PRIMARY KEY`.execute(trx);
    await sql`ALTER TABLE login_sessions ADD PRIMARY KEY (id)`.execute(trx);

    // Revert client_id column to reference applications (if applications table exists)
    // This assumes the applications table still exists
    await sql`ALTER TABLE refresh_tokens 
      ADD CONSTRAINT refresh_tokens_application_fk 
      FOREIGN KEY (client_id) REFERENCES applications(id) ON DELETE CASCADE`.execute(
      trx,
    );

    await sql`ALTER TABLE login_sessions 
      ADD CONSTRAINT login_sessions_application_fk 
      FOREIGN KEY (authParams_client_id) REFERENCES applications(id) ON DELETE CASCADE`.execute(
      trx,
    );
  });
}

async function downSQLite(db: Kysely<Database>): Promise<void> {
  // For SQLite, we need to recreate tables to change constraints
  // This is a simplified rollback - in practice, you might want to preserve more state
  await db.transaction().execute(async (trx) => {
    // Remove foreign key constraint from refresh_tokens (recreate table)
    await sql`CREATE TABLE refresh_tokens_temp AS SELECT * FROM refresh_tokens`.execute(
      trx,
    );
    await sql`DROP TABLE refresh_tokens`.execute(trx);

    await trx.schema
      .createTable("refresh_tokens")
      .addColumn("id", "varchar(21)", (col) => col.primaryKey())
      .addColumn("tenant_id", "varchar(255)", (col) =>
        col.references("tenants.id").onDelete("cascade").notNull(),
      )
      .addColumn("client_id", "varchar(21)", (col) =>
        col.references("applications.id").onDelete("cascade").notNull(),
      )
      .addColumn("session_id", "varchar(21)", (col) => col.notNull())
      .addColumn("user_id", "varchar(255)")
      .addColumn("resource_servers", "varchar(255)", (col) => col.notNull())
      .addColumn("device", "varchar(255)", (col) => col.notNull())
      .addColumn("rotating", "boolean", (col) => col.notNull())
      .addColumn("created_at", "varchar(35)", (col) => col.notNull())
      .addColumn("expires_at", "varchar(35)")
      .addColumn("idle_expires_at", "varchar(35)")
      .addColumn("last_exchanged_at", "varchar(35)")
      .execute();

    await sql`INSERT INTO refresh_tokens 
      SELECT id, tenant_id, client_id, session_id, user_id, resource_servers, device, rotating, 
             created_at, expires_at, idle_expires_at, last_exchanged_at
      FROM refresh_tokens_temp`.execute(trx);

    await sql`DROP TABLE refresh_tokens_temp`.execute(trx);

    // Remove the foreign key constraint from login_sessions (recreate table)
    await sql`CREATE TABLE login_sessions_temp AS SELECT * FROM login_sessions`.execute(
      trx,
    );
    await sql`DROP TABLE login_sessions`.execute(trx);

    await trx.schema
      .createTable("login_sessions")
      .addColumn("id", "varchar(21)", (col) => col.primaryKey())
      .addColumn("tenant_id", "varchar(255)", (col) =>
        col.references("tenants.id").onDelete("cascade").notNull(),
      )
      .addColumn("session_id", "varchar(21)")
      .addColumn("csrf_token", "varchar(21)", (col) => col.notNull())
      .addColumn("authParams_client_id", "varchar(191)", (col) =>
        col.references("applications.id").onDelete("cascade").notNull(),
      )
      // ... (add all other columns as needed)
      .execute();

    // Restore data (simplified - you'd need all columns)
    await sql`INSERT INTO login_sessions (id, tenant_id, session_id, csrf_token, authParams_client_id) 
      SELECT id, tenant_id, session_id, csrf_token, authParams_client_id
      FROM login_sessions_temp`.execute(trx);

    await sql`DROP TABLE login_sessions_temp`.execute(trx);
  });
}
