import { Kysely, sql } from "kysely";
import {
  StatsAdapter,
  StatsListParams,
  DailyStats,
} from "@authhero/adapter-interfaces";
import { Database } from "../db";

// Log types that count as successful logins
const LOGIN_TYPES = [
  "s", // SUCCESS_LOGIN
  "seacft", // SUCCESS_EXCHANGE_AUTHORIZATION_CODE_FOR_ACCESS_TOKEN
  "seccft", // SUCCESS_EXCHANGE_CLIENT_CREDENTIALS_FOR_ACCESS_TOKEN
  "sepft", // SUCCESS_EXCHANGE_PASSWORD_FOR_ACCESS_TOKEN
  "sertft", // SUCCESS_EXCHANGE_REFRESH_TOKEN_FOR_ACCESS_TOKEN
  "ssa", // SUCCESS_SILENT_AUTH
] as const;

// Log types that indicate leaked password detection
const LEAKED_PASSWORD_TYPES = [
  "pwd_leak",
  "signup_pwd_leak",
  "reset_pwd_leak",
] as const;

/**
 * Parses a date string in YYYYMMDD format to YYYY-MM-DD
 */
function parseYYYYMMDD(dateStr: string): string {
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * Gets date string in YYYY-MM-DD format
 */
function toDateString(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export function createStatsAdapter(db: Kysely<Database>): StatsAdapter {
  return {
    async getDaily(
      tenantId: string,
      params: StatsListParams = {},
    ): Promise<DailyStats[]> {
      const { from, to } = params;

      // Default to last 30 days if no dates provided
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const fromDate = from ? parseYYYYMMDD(from) : toDateString(thirtyDaysAgo);
      const toDate = to ? parseYYYYMMDD(to) : toDateString(now);

      // Note: We use sql`` for DATE() function as it's database-specific
      // and for conditional aggregation (SUM + CASE) which Kysely doesn't
      // have a type-safe builder for
      const dateExpr = sql<string>`DATE(logs.date)`;

      const results = await db
        .selectFrom("logs")
        .where("tenant_id", "=", tenantId)
        .where(dateExpr, ">=", fromDate)
        .where(dateExpr, "<=", toDate)
        .select((eb) => [
          dateExpr.as("date"),
          eb.fn
            .sum(
              eb
                .case()
                .when("type", "in", LOGIN_TYPES)
                .then(1)
                .else(0)
                .end(),
            )
            .as("logins"),
          eb.fn
            .sum(
              eb.case().when("type", "=", "ss").then(1).else(0).end(),
            )
            .as("signups"),
          eb.fn
            .sum(
              eb
                .case()
                .when("type", "in", LEAKED_PASSWORD_TYPES)
                .then(1)
                .else(0)
                .end(),
            )
            .as("leaked_passwords"),
          eb.fn.min("date").as("first_event"),
          eb.fn.max("date").as("last_event"),
        ])
        .groupBy(dateExpr)
        .orderBy("date", "asc")
        .execute();

      return results.map((row) => ({
        date: row.date,
        logins: Number(row.logins) || 0,
        signups: Number(row.signups) || 0,
        leaked_passwords: Number(row.leaked_passwords) || 0,
        created_at: row.first_event || new Date().toISOString(),
        updated_at: row.last_event || new Date().toISOString(),
      }));
    },

    async getActiveUsers(tenantId: string): Promise<number> {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await db
        .selectFrom("logs")
        .where("tenant_id", "=", tenantId)
        .where("date", ">=", thirtyDaysAgo.toISOString())
        .where("type", "in", LOGIN_TYPES)
        .where("user_id", "is not", null)
        .select((eb) =>
          eb.fn.count<number>("user_id").distinct().as("count"),
        )
        .executeTakeFirstOrThrow();

      return result.count || 0;
    },
  };
}
