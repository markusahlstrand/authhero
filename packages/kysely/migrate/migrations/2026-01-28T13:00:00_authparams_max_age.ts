import { Kysely } from "kysely";

/**
 * Add authParams_max_age and authParams_acr_values columns to login_sessions table
 * This is needed for OIDC Core 3.1.2.1 max_age and acr_values parameter support
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Add max_age column
  try {
    await db.schema
      .alterTable("login_sessions")
      .addColumn("authParams_max_age", "integer")
      .execute();
    console.log("  Added column authParams_max_age to login_sessions");
  } catch (error) {
    // Column might already exist
    console.log(
      `  Warning: Could not add authParams_max_age column: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Add acr_values column
  try {
    await db.schema
      .alterTable("login_sessions")
      .addColumn("authParams_acr_values", "text")
      .execute();
    console.log("  Added column authParams_acr_values to login_sessions");
  } catch (error) {
    // Column might already exist
    console.log(
      `  Warning: Could not add authParams_acr_values column: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  try {
    await db.schema
      .alterTable("login_sessions")
      .dropColumn("authParams_max_age")
      .execute();
    console.log("  Dropped column authParams_max_age from login_sessions");
  } catch (error) {
    console.log(
      `  Warning: Could not drop authParams_max_age column: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await db.schema
      .alterTable("login_sessions")
      .dropColumn("authParams_acr_values")
      .execute();
    console.log("  Dropped column authParams_acr_values from login_sessions");
  } catch (error) {
    console.log(
      `  Warning: Could not drop authParams_acr_values column: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
