import { describe, it, expect } from "vitest";
import {
  MAX_HOURLY_RANGE_DAYS,
  autoInterval,
  formatBucket,
  rangeDays,
  resolveInterval,
} from "./analyticsTime";

const DAY_MS = 86_400_000;
const from = new Date("2026-01-01T00:00:00Z");
const after = (days: number) => new Date(from.getTime() + days * DAY_MS);

describe("rangeDays", () => {
  it("returns the fractional number of days between two dates", () => {
    expect(rangeDays(from, after(1))).toBe(1);
    expect(rangeDays(from, after(1.5))).toBe(1.5);
  });

  it("is zero for identical dates and negative for reversed ranges", () => {
    expect(rangeDays(from, from)).toBe(0);
    expect(rangeDays(after(2), from)).toBe(-2);
  });
});

describe("MAX_HOURLY_RANGE_DAYS", () => {
  it("is 30", () => {
    expect(MAX_HOURLY_RANGE_DAYS).toBe(30);
  });

  it("is never exceeded by a range that auto-selects the hour interval", () => {
    expect(rangeDays(from, after(2))).toBeLessThanOrEqual(
      MAX_HOURLY_RANGE_DAYS,
    );
    // Just past the hour cut-off must move off hourly buckets.
    expect(autoInterval(from, after(MAX_HOURLY_RANGE_DAYS))).not.toBe("hour");
  });
});

describe("autoInterval", () => {
  it("uses hour up to and including 2 days", () => {
    expect(autoInterval(from, from)).toBe("hour");
    expect(autoInterval(from, after(1))).toBe("hour");
    expect(autoInterval(from, after(2))).toBe("hour");
  });

  it("switches to day just above 2 days", () => {
    expect(autoInterval(from, new Date(after(2).getTime() + 1))).toBe("day");
  });

  it("uses day up to and including 90 days", () => {
    expect(autoInterval(from, after(30))).toBe("day");
    expect(autoInterval(from, after(90))).toBe("day");
  });

  it("switches to week just above 90 days", () => {
    expect(autoInterval(from, new Date(after(90).getTime() + 1))).toBe("week");
  });

  it("uses week up to and including 365 days", () => {
    expect(autoInterval(from, after(365))).toBe("week");
  });

  it("switches to month just above 365 days", () => {
    expect(autoInterval(from, new Date(after(365).getTime() + 1))).toBe(
      "month",
    );
    expect(autoInterval(from, after(1000))).toBe("month");
  });
});

describe("resolveInterval", () => {
  it("resolves auto via autoInterval", () => {
    expect(resolveInterval("auto", from, after(1))).toBe("hour");
    expect(resolveInterval("auto", from, after(10))).toBe("day");
    expect(resolveInterval("auto", from, after(200))).toBe("week");
    expect(resolveInterval("auto", from, after(400))).toBe("month");
  });

  it("returns an explicit setting regardless of range", () => {
    expect(resolveInterval("month", from, after(1))).toBe("month");
    expect(resolveInterval("hour", from, after(400))).toBe("hour");
    expect(resolveInterval("day", from, after(400))).toBe("day");
    expect(resolveInterval("week", from, after(1))).toBe("week");
  });
});

// Bucket strings carry no timezone designator, so parseISO reads them as
// local time and date-fns formats them back in local time - the output is
// the same on every machine regardless of TZ.
describe("formatBucket", () => {
  const bucket = "2026-03-05T14:30:00";

  it("formats hour buckets with the time", () => {
    expect(formatBucket(bucket, "hour")).toBe("Mar 5, 14:30");
  });

  it("formats day buckets as month and day", () => {
    expect(formatBucket(bucket, "day")).toBe("Mar 5");
  });

  it("formats week buckets with a 'Week of' prefix", () => {
    expect(formatBucket(bucket, "week")).toBe("Week of Mar 5");
  });

  it("formats month buckets as month and year", () => {
    expect(formatBucket(bucket, "month")).toBe("Mar 2026");
  });

  it("accepts date-only bucket strings", () => {
    expect(formatBucket("2026-12-31", "day")).toBe("Dec 31");
    expect(formatBucket("2026-12-31", "month")).toBe("Dec 2026");
  });

  it("falls back to the raw value when it cannot be parsed", () => {
    expect(formatBucket("not-a-date", "day")).toBe("not-a-date");
    expect(formatBucket(undefined, "hour")).toBe("undefined");
    expect(formatBucket(null, "month")).toBe("null");
  });
});
