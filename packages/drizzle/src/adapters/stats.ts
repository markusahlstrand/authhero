import { eq, and, gte, lte, sql } from "drizzle-orm";
import { logs } from "../schema/sqlite";
import type { DrizzleDb } from "./types";

const LOGIN_TYPES = ["s", "seacft", "seccft", "sepft", "sertft", "ssa"];
const LEAKED_PASSWORD_TYPES = ["pwd_leak", "signup_pwd_leak", "reset_pwd_leak"];

export function createStatsAdapter(db: DrizzleDb) {
  return {
    async getDaily(tenant_id: string, params?: any) {
      const now = new Date();
      const from =
        params?.from ||
        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];
      const to = params?.to || now.toISOString().split("T")[0];

      // Use raw SQL for date aggregation
      const results = await db
        .select({
          date: sql<string>`substr(${logs.date}, 1, 10)`.as("date"),
          logins: sql<number>`SUM(CASE WHEN ${logs.type} IN (${sql.join(
            LOGIN_TYPES.map((t) => sql`${t}`),
            sql`, `,
          )}) THEN 1 ELSE 0 END)`.as("logins"),
          signups:
            sql<number>`SUM(CASE WHEN ${logs.type} = 'ss' THEN 1 ELSE 0 END)`.as(
              "signups",
            ),
          leaked_passwords:
            sql<number>`SUM(CASE WHEN ${logs.type} IN (${sql.join(
              LEAKED_PASSWORD_TYPES.map((t) => sql`${t}`),
              sql`, `,
            )}) THEN 1 ELSE 0 END)`.as("leaked_passwords"),
        })
        .from(logs)
        .where(
          and(
            eq(logs.tenant_id, tenant_id),
            gte(logs.date, from!),
            lte(logs.date, `${to}T23:59:59.999Z`),
          ),
        )
        .groupBy(sql`substr(${logs.date}, 1, 10)`)
        .orderBy(sql`substr(${logs.date}, 1, 10)`)
        .all();

      return results.map((row) => ({
        date: row.date,
        logins: Number(row.logins) || 0,
        signups: Number(row.signups) || 0,
        leaked_passwords: Number(row.leaked_passwords) || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    },

    async getActiveUsers(tenant_id: string): Promise<number> {
      const thirtyDaysAgo = new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [result] = await db
        .select({
          count: sql<number>`COUNT(DISTINCT ${logs.user_id})`.as("count"),
        })
        .from(logs)
        .where(
          and(
            eq(logs.tenant_id, tenant_id),
            gte(logs.date, thirtyDaysAgo),
            sql`${logs.type} IN (${sql.join(
              LOGIN_TYPES.map((t) => sql`${t}`),
              sql`, `,
            )})`,
          ),
        );

      return Number(result?.count) || 0;
    },
  };
}
