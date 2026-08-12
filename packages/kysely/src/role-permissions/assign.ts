import { Kysely } from "kysely";
import { Database } from "../db";
import {
  CreateOptions,
  RolePermissionInsert,
} from "@authhero/adapter-interfaces";

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const { code, message } = error as { code?: unknown; message?: unknown };

  if (
    code === "SQLITE_CONSTRAINT" ||
    code === "SQLITE_CONSTRAINT_PRIMARYKEY" ||
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "ER_DUP_ENTRY" ||
    code === "23505" // PostgreSQL unique violation
  ) {
    return true;
  }

  return (
    typeof message === "string" &&
    (message.includes("UNIQUE constraint failed") ||
      message.includes("Duplicate entry") ||
      message.includes("duplicate key") ||
      message.includes("AlreadyExists"))
  );
}

export function assign(db: Kysely<Database>) {
  return async (
    tenant_id: string,
    role_id: string,
    permissions: RolePermissionInsert[],
    options?: CreateOptions,
  ): Promise<boolean> => {
    if (permissions.length === 0) return true;

    const importMetadata = options?.importMetadata;
    const now = new Date().toISOString();

    try {
      // Insert permissions one by one to handle duplicates gracefully
      for (const permission of permissions) {
        // Validate that the role_id in the permission matches the parameter
        if (permission.role_id !== role_id) {
          throw new Error(
            `Permission role_id ${permission.role_id} does not match expected role_id ${role_id}`,
          );
        }

        const assignment = {
          tenant_id,
          role_id: permission.role_id,
          resource_server_identifier: permission.resource_server_identifier,
          permission_name: permission.permission_name,
          created_at: importMetadata?.created_at ?? now,
        };

        try {
          await db.insertInto("role_permissions").values(assignment).execute();
        } catch (error) {
          // Assigning an already-assigned permission is a no-op, not a
          // failure. PlanetScale reports the duplicate in the message rather
          // than on `code` (no ER_DUP_ENTRY), so match both forms — otherwise
          // the outer catch turns a re-assign into a 500.
          if (isDuplicateKeyError(error)) {
            continue;
          }
          throw error; // Re-throw other errors
        }
      }
      return true;
    } catch (error) {
      console.error("Error assigning role permissions:", error);
      return false;
    }
  };
}
