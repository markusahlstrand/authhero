import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import { users } from "./users";

/**
 * Write-often per-user counters split out of the `users` row (issue #1003) so
 * the profile row isn't rewritten on every login / failed password attempt.
 * 1:1 with a user; a missing row means the user never logged in. Mirrors the
 * kysely adapter's `user_activity` table.
 */
export const userActivity = sqliteTable(
  "user_activity",
  {
    tenant_id: text("tenant_id", { length: 255 }).notNull(),
    user_id: text("user_id", { length: 255 }).notNull(),
    last_login: text("last_login", { length: 35 }),
    last_ip: text("last_ip", { length: 45 }), // right-sized for IPv6
    login_count: integer("login_count").notNull().default(0),
    failed_logins: text("failed_logins"), // JSON array of lockout timestamps
    last_password_reset: text("last_password_reset", { length: 35 }),
  },
  (table) => [
    primaryKey({
      columns: [table.tenant_id, table.user_id],
      name: "user_activity_pkey",
    }),
    foreignKey({
      columns: [table.user_id, table.tenant_id],
      foreignColumns: [users.user_id, users.tenant_id],
      name: "user_activity_user_id_constraint",
    }).onDelete("cascade"),
  ],
);
