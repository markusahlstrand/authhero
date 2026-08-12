/**
 * Locale-aware layout for the segmented DATE input.
 *
 * The segment order is resolved from a static table rather than from
 * `Intl.DateTimeFormat`, deliberately: the widget is server-rendered and then
 * hydrated in the browser, and the two runtimes do not ship the same ICU data
 * (a Workers runtime commonly falls back to en-US ordering). A static table
 * gives the server and the client the same answer, so the hydrated DOM matches
 * the rendered one.
 */

export type DateSegment = "year" | "month" | "day";

export interface DateLayout {
  /** Segment order, left to right. */
  order: DateSegment[];
  /** Placeholder token per segment, e.g. { day: "DD", ... }. */
  tokens: Record<DateSegment, string>;
  /** Character drawn between segments. */
  separator: string;
}

/** Languages that write dates big-endian: year, month, day. */
const YEAR_FIRST_LANGUAGES = new Set([
  "bo",
  "dz",
  "hu",
  "ja",
  "ko",
  "lt",
  "mn",
  "sv",
  "ug",
  "zh",
]);

/**
 * Regions that write month before day. Month-first is essentially a US
 * convention plus the places that adopted it.
 */
const MONTH_FIRST_REGIONS = new Set(["us", "ph", "fm", "mh", "pw", "as", "gu"]);

/**
 * Locales whose language is normally year-first but which write dates
 * day-first in a particular region — Finland-Swedish is d.m.yyyy, unlike
 * Sweden-Swedish.
 */
const DAY_FIRST_TAGS = new Set(["sv-fi"]);

const DEFAULT_TOKENS: Record<DateSegment, string> = {
  day: "DD",
  month: "MM",
  year: "YYYY",
};

/**
 * Split a BCP-47 tag into a lowercase language subtag and, when present, a
 * two-letter region subtag. Script and variant subtags are ignored.
 */
function parseTag(locale: string | undefined): {
  language: string;
  region?: string;
} {
  const tag = (locale || "").toLowerCase().replace(/_/g, "-");
  const parts = tag.split("-").filter(Boolean);
  const language = parts[0] || "";
  const region = parts.slice(1).find((part) => /^[a-z]{2}$/.test(part));
  return { language, region };
}

/**
 * Resolve the segment order for a locale. Falls back to day-month-year, which
 * is what most of the world writes.
 */
export function getDateOrder(locale?: string): DateSegment[] {
  const { language, region } = parseTag(locale);

  if (region && MONTH_FIRST_REGIONS.has(region)) {
    return ["month", "day", "year"];
  }
  if (region && DAY_FIRST_TAGS.has(`${language}-${region}`)) {
    return ["day", "month", "year"];
  }
  if (YEAR_FIRST_LANGUAGES.has(language)) {
    return ["year", "month", "day"];
  }
  // A bare "en" carries no region — treat it the way Intl does and assume
  // en-US. Regional English (en-gb, en-au, …) falls through to day-first.
  if (language === "en" && !region) {
    return ["month", "day", "year"];
  }
  return ["day", "month", "year"];
}

/**
 * Parse an explicit format string from the component config, e.g.
 * "DD/MM/YYYY" or "YYYY-MM-DD". Returns null when the string does not name
 * all three segments.
 */
function parseFormat(format: string): DateLayout | null {
  const matches = format.match(/y+|m+|d+/gi);
  if (!matches) return null;

  const order: DateSegment[] = [];
  const tokens: Record<DateSegment, string> = { ...DEFAULT_TOKENS };
  for (const match of matches) {
    const initial = match[0]!.toLowerCase();
    const segment: DateSegment =
      initial === "y" ? "year" : initial === "m" ? "month" : "day";
    if (order.includes(segment)) continue;
    order.push(segment);
    // A "YY" format still collects a four-digit year — the segment holds four
    // characters and `toIsoDate` rejects anything shorter, with a two-digit
    // entry expanded on blur. Showing "YY" as the placeholder would promise an
    // input the field does not accept, so short year tokens are widened.
    tokens[segment] =
      segment === "year" && match.length < 4 ? DEFAULT_TOKENS.year : match;
  }
  if (order.length !== 3) return null;

  const separator = format.match(/[^a-z\s]/i)?.[0] ?? "/";
  return { order, tokens, separator };
}

/**
 * Resolve the full layout for a DATE field. An explicit `config.format` wins;
 * otherwise the locale decides the order.
 */
export function getDateLayout(format?: string, locale?: string): DateLayout {
  if (format) {
    const parsed = parseFormat(format);
    if (parsed) return parsed;
  }
  const order = getDateOrder(locale);
  return {
    order,
    tokens: DEFAULT_TOKENS,
    separator: order[0] === "year" ? "-" : "/",
  };
}

/** Number of days in a given month, honouring leap years. */
export function daysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Split an ISO "YYYY-MM-DD" value into its segments. */
export function parseIsoDate(
  value: string | undefined,
): Record<DateSegment, string> | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value || "").trim());
  if (!match) return null;
  return { year: match[1]!, month: match[2]!, day: match[3]! };
}

/**
 * Build an ISO "YYYY-MM-DD" string from segment values. Returns "" unless all
 * three segments are complete and form a real calendar date — a half-filled or
 * impossible date (31 February) is not a value worth submitting.
 */
export function toIsoDate(segments: Record<DateSegment, string>): string {
  const { year, month, day } = segments;
  if (year.length !== 4 || month.length === 0 || day.length === 0) return "";

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    return "";
  }
  if (m < 1 || m > 12) return "";
  if (d < 1 || d > daysInMonth(y, m)) return "";

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(
    d,
  ).padStart(2, "0")}`;
}

/**
 * Expand a two-digit year into the most recent matching year at or before
 * `anchorYear` — "85" becomes 1985, "05" becomes 2005. Anything that is not
 * exactly two digits is returned unchanged, so a fully typed year is never
 * second-guessed.
 */
export function expandTwoDigitYear(year: string, anchorYear: number): string {
  if (!/^\d{2}$/.test(year)) return year;

  const century = Math.floor(anchorYear / 100) * 100;
  const candidate = century + Number(year);
  return String(candidate > anchorYear ? candidate - 100 : candidate);
}

/**
 * The latest year a two-digit entry may expand to. `config.max` pins it when
 * the field has an upper bound; otherwise we assume a date in the past (the
 * birthdate case) and anchor on the current year.
 */
export function resolveYearAnchor(
  max: string | undefined,
  today: Date,
): number {
  const parsed = parseIsoDate(max);
  if (parsed) return Number(parsed.year);
  return today.getUTCFullYear();
}
