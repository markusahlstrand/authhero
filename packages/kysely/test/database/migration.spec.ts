import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("database setup", () => {
  it("should have role_permissions and user_permissions tables after migration", async () => {
    const { db } = await getTestServer();

    // Check if role_permissions table exists
    try {
      const rolePermissionsResult = await db
        .selectFrom("role_permissions")
        .selectAll()
        .execute();
      expect(Array.isArray(rolePermissionsResult)).toBe(true);
    } catch (error) {
      console.error("role_permissions table error:", error);
      throw error;
    }

    // Check if user_permissions table exists
    try {
      const userPermissionsResult = await db
        .selectFrom("user_permissions")
        .selectAll()
        .execute();
      expect(Array.isArray(userPermissionsResult)).toBe(true);
    } catch (error) {
      console.error("user_permissions table error:", error);
      throw error;
    }

    // Check if resource_servers table exists
    try {
      const resourceServersResult = await db
        .selectFrom("resource_servers")
        .selectAll()
        .execute();
      expect(Array.isArray(resourceServersResult)).toBe(true);
    } catch (error) {
      console.error("resource_servers table error:", error);
      throw error;
    }

    // Check if roles table exists
    try {
      const rolesResult = await db.selectFrom("roles").selectAll().execute();
      expect(Array.isArray(rolesResult)).toBe(true);
    } catch (error) {
      console.error("roles table error:", error);
      throw error;
    }
  });
});
