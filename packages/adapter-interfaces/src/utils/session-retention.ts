import {
  RefreshTokenRetentionResponse,
  SessionRetentionCohort,
  SessionRetentionResponse,
} from "../types/Analytics";

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The Unix epoch (1970-01-01) was a Thursday; adding 3 days before dividing
 * by a week aligns bucket boundaries to Monday 00:00 UTC.
 */
export const MONDAY_EPOCH_SHIFT_MS = 3 * 24 * 60 * 60 * 1000;

/** Monday-aligned week index for an epoch-ms timestamp. */
export function weekIndex(epochMs: number): number {
  return Math.floor((epochMs + MONDAY_EPOCH_SHIFT_MS) / WEEK_MS);
}

/** Epoch ms of the UTC Monday a week index starts on. */
export function weekStartMs(week: number): number {
  return week * WEEK_MS - MONDAY_EPOCH_SHIFT_MS;
}

export interface SessionRetentionWindow {
  currentWeek: number;
  firstWeek: number;
  /** Epoch ms lower bound for created_at_ts — the start of the first cohort week */
  sinceMs: number;
}

export function sessionRetentionWindow(
  weeks: number,
  now: number = Date.now(),
): SessionRetentionWindow {
  const currentWeek = weekIndex(now);
  const firstWeek = currentWeek - weeks + 1;
  return { currentWeek, firstWeek, sinceMs: weekStartMs(firstWeek) };
}

export interface SessionRetentionRawRow {
  /** Monday-aligned week index the session was created in */
  created_week: number;
  /** Monday-aligned week index the session was last used in */
  used_week: number;
  count: number;
}

/**
 * Fold raw (created-week × last-used-week) counts into per-cohort retention.
 * A session counts as active k weeks after its cohort week when it was last
 * used during that week or any later one, so a single last-used timestamp is
 * enough to reconstruct the whole retention triangle.
 */
export function buildSessionRetention(
  rows: SessionRetentionRawRow[],
  weeks: number,
  now: number = Date.now(),
): SessionRetentionResponse {
  const { currentWeek, firstWeek, sinceMs } = sessionRetentionWindow(
    weeks,
    now,
  );

  const byCohort = new Map<number, Map<number, number>>();
  for (const row of rows) {
    if (row.created_week < firstWeek || row.created_week > currentWeek) {
      continue;
    }
    // Clamp into [0, weeks-until-now] so clock skew can't drop rows from the
    // suffix sums below.
    const offset = Math.min(
      Math.max(0, row.used_week - row.created_week),
      currentWeek - row.created_week,
    );
    let offsets = byCohort.get(row.created_week);
    if (!offsets) {
      offsets = new Map();
      byCohort.set(row.created_week, offsets);
    }
    offsets.set(offset, (offsets.get(offset) ?? 0) + row.count);
  }

  const cohorts: SessionRetentionCohort[] = [];
  for (let week = firstWeek; week <= currentWeek; week++) {
    const offsets = byCohort.get(week);
    const maxOffset = currentWeek - week;
    const active: number[] = [];
    // active[k] = sessions whose last-used week is >= k weeks after creation;
    // accumulate from the highest offset down so each step is a suffix sum.
    let running = 0;
    for (let k = maxOffset; k >= 0; k--) {
      running += offsets?.get(k) ?? 0;
      active[k] = running;
    }
    cohorts.push({
      cohort: new Date(weekStartMs(week)).toISOString().slice(0, 10),
      sessions: active[0] ?? 0,
      active,
    });
  }

  return {
    interval: "week",
    from: new Date(sinceMs).toISOString(),
    to: new Date(now).toISOString(),
    cohorts,
  };
}

/**
 * Same fold as {@link buildSessionRetention}, but the rows count refresh-token
 * families (created-week = the family's first token, used-week = its last
 * exchange) and the per-cohort total is reported as `tokens`.
 */
export function buildRefreshTokenRetention(
  rows: SessionRetentionRawRow[],
  weeks: number,
  now: number = Date.now(),
): RefreshTokenRetentionResponse {
  const base = buildSessionRetention(rows, weeks, now);
  return {
    interval: base.interval,
    from: base.from,
    to: base.to,
    cohorts: base.cohorts.map(({ cohort, sessions, active }) => ({
      cohort,
      tokens: sessions,
      active,
    })),
  };
}
