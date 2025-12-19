import { DailyStats } from "../types";

export interface StatsListParams {
  from?: string; // YYYYMMDD format
  to?: string; // YYYYMMDD format
}

export interface StatsAdapter {
  /**
   * Get daily statistics (logins, signups, etc.) for a date range
   */
  getDaily(tenantId: string, params?: StatsListParams): Promise<DailyStats[]>;

  /**
   * Get the number of active users in the last 30 days
   */
  getActiveUsers(tenantId: string): Promise<number>;
}
