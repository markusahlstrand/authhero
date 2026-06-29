import { z } from "@hono/zod-openapi";

export const analyticsResourceSchema = z.enum([
  "active-users",
  "logins",
  "signups",
  "refresh-tokens",
  "sessions",
  "logouts",
  "password-changes",
  "mfa",
  "email-verifications",
  "codes-sent",
]);
export type AnalyticsResource = z.infer<typeof analyticsResourceSchema>;

export const analyticsIntervalSchema = z.enum(["hour", "day", "week", "month"]);
export type AnalyticsInterval = z.infer<typeof analyticsIntervalSchema>;

export const analyticsGroupBySchema = z.enum([
  "time",
  "connection",
  "client_id",
  "user_type",
  "event",
]);
export type AnalyticsGroupBy = z.infer<typeof analyticsGroupBySchema>;

export const analyticsUserTypeSchema = z.enum([
  "password",
  "social",
  "passwordless",
  "enterprise",
]);
export type AnalyticsUserType = z.infer<typeof analyticsUserTypeSchema>;

export interface AnalyticsFilters {
  connection?: string[];
  client_id?: string[];
  user_type?: AnalyticsUserType[];
  user_id?: string[];
}

export interface AnalyticsQueryParams {
  /** Inclusive lower bound, ISO 8601 datetime in UTC */
  from: string;
  /** Exclusive upper bound, ISO 8601 datetime in UTC */
  to: string;
  interval: AnalyticsInterval;
  /** IANA timezone for bucket boundaries */
  tz: string;
  filters: AnalyticsFilters;
  group_by: AnalyticsGroupBy[];
  limit: number;
  offset: number;
  /** Column name, prefix with `-` for descending */
  order_by?: string;
}

export interface AnalyticsColumnMeta {
  name: string;
  /** ClickHouse-style type label (e.g. "Date", "String", "UInt64", "DateTime") */
  type: string;
}

export interface AnalyticsQueryResponse {
  meta: AnalyticsColumnMeta[];
  data: Array<Record<string, unknown>>;
  rows: number;
  rows_before_limit_at_least?: number;
  statistics?: {
    elapsed: number;
    rows_read?: number;
    bytes_read?: number;
  };
}

export const analyticsColumnMetaSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const analyticsStatisticsSchema = z.object({
  elapsed: z.number(),
  rows_read: z.number().optional(),
  bytes_read: z.number().optional(),
});

export const analyticsQueryResponseSchema = z.object({
  meta: z.array(analyticsColumnMetaSchema),
  data: z.array(z.record(z.string(), z.any())),
  rows: z.number(),
  rows_before_limit_at_least: z.number().optional(),
  statistics: analyticsStatisticsSchema.optional(),
});
