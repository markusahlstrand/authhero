import { format, parseISO } from "date-fns";
import type { AnalyticsInterval } from "./useAnalyticsQuery";

export type IntervalSetting = AnalyticsInterval | "auto";

const DAY_MS = 86_400_000;

/** Backend only allows the hour interval for ranges up to 30 days. */
export const MAX_HOURLY_RANGE_DAYS = 30;

export function rangeDays(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / DAY_MS;
}

/**
 * Pick a sensible bucket size for a range, Datadog/Kibana-style. Mirrors the
 * backend's hour-only-within-30-days constraint so "Auto" never errors.
 */
export function autoInterval(from: Date, to: Date): AnalyticsInterval {
  const days = rangeDays(from, to);
  if (days <= 2) return "hour";
  if (days <= 90) return "day";
  if (days <= 365) return "week";
  return "month";
}

export function resolveInterval(
  setting: IntervalSetting,
  from: Date,
  to: Date,
): AnalyticsInterval {
  return setting === "auto" ? autoInterval(from, to) : setting;
}

/**
 * Format a time-bucket value from the analytics API for an axis tick or
 * tooltip label. The bucket granularity drives the format so an hourly view
 * shows hours instead of just the date.
 */
export function formatBucket(
  value: unknown,
  interval: AnalyticsInterval,
): string {
  try {
    const date = parseISO(String(value));
    switch (interval) {
      case "hour":
        return format(date, "MMM d, HH:mm");
      case "month":
        return format(date, "MMM yyyy");
      case "week":
        return `Week of ${format(date, "MMM d")}`;
      case "day":
      default:
        return format(date, "MMM d");
    }
  } catch {
    return String(value);
  }
}
