import { StatsAdapter, DailyStats } from "@authhero/adapter-interfaces";

/**
 * Create a stats adapter for R2 SQL that returns "not supported" errors
 *
 * R2 SQL logs does not currently support stats queries.
 * Use the Analytics Engine stats adapter or Kysely stats adapter instead.
 */
export function createR2SQLStatsAdapter(): StatsAdapter {
  return {
    async getDaily(): Promise<DailyStats[]> {
      throw new Error(
        "Stats queries are not supported by R2 SQL logs adapter. Use Analytics Engine or Kysely adapter instead.",
      );
    },

    async getActiveUsers(): Promise<number> {
      throw new Error(
        "Stats queries are not supported by R2 SQL logs adapter. Use Analytics Engine or Kysely adapter instead.",
      );
    },
  };
}
