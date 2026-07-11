import { SQL, sql, asc, desc, gt, lt, Column } from "drizzle-orm";
import {
  ListParams,
  decodeCursor,
  encodeCursor,
} from "@authhero/adapter-interfaces";

/**
 * Keyset (checkpoint) pagination primitives for the drizzle adapters — the
 * Auth0 `from`/`take` style. `from` is an OPAQUE cursor (see encodeCursor)
 * decoded to a `(sortValue, id)` position; `take` is the page size.
 *
 * Keyset-only: offset pagination (page/per_page + total), which the admin UI
 * uses and which honors arbitrary user sort, stays in each adapter untouched.
 * Adapters branch to these helpers only when from/take is present. Because
 * drizzle's `.where()` replaces rather than appends, these are exposed as
 * composable pieces (condition / orderBy / slice) an adapter folds into its
 * own query rather than one all-in-one function.
 */
export function isKeysetRequest(params?: ListParams): boolean {
  return params?.from !== undefined || params?.take !== undefined;
}

// Auth0 caps take: "Values above the maximum permitted size are capped."
const MAX_TAKE = 100;

export function keysetTake(params?: ListParams): number {
  const raw = params?.take;
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  return n >= 1 ? Math.min(n, MAX_TAKE) : 50;
}

export interface KeysetColumns {
  sortColumn: Column;
  idColumn: Column;
  sortOrder: "asc" | "desc";
}

/** ORDER BY sortColumn, idColumn (tiebreaker), in the requested direction. */
export function keysetOrderBy(cols: KeysetColumns): SQL[] {
  const dir = cols.sortOrder === "asc" ? asc : desc;
  return [dir(cols.sortColumn), dir(cols.idColumn)];
}

/**
 * WHERE predicate that resumes after the cursor, or undefined for the first
 * page. Uses a row-value comparison `(sort, id) </> (s, i)` (supported by
 * SQLite >= 3.15 and MySQL) so the keyset is stable across the sort column and
 * its unique tiebreaker.
 */
export function keysetCondition(
  params: ListParams | undefined,
  cols: KeysetColumns,
): SQL | undefined {
  const cursor = params?.from ? decodeCursor(params.from) : null;
  if (!cursor) return undefined;

  if (cursor.s === undefined || cursor.s === null) {
    // Id-only ordering (or a null boundary): compare on the tiebreaker alone.
    return cols.sortOrder === "asc"
      ? gt(cols.idColumn, cursor.i)
      : lt(cols.idColumn, cursor.i);
  }

  const op = cols.sortOrder === "asc" ? sql.raw(">") : sql.raw("<");
  return sql`(${cols.sortColumn}, ${cols.idColumn}) ${op} (${cursor.s}, ${cursor.i})`;
}

/**
 * Given rows fetched with `limit(take + 1)`, trim to the page and compute the
 * `next` cursor. `sortField`/`idField` are the property names on the mapped or
 * raw row to read the keyset position from.
 */
export function sliceWithNext<Row extends Record<string, unknown>>(
  rows: Row[],
  take: number,
  sortField: string,
  idField = "id",
): { rows: Row[]; next?: string } {
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  let next: string | undefined;
  const last = page[page.length - 1];
  if (hasMore && last) {
    const sortValue = last[sortField];
    next = encodeCursor({
      s:
        typeof sortValue === "string" ||
        typeof sortValue === "number" ||
        sortValue === null
          ? (sortValue as string | number | null)
          : String(sortValue),
      i: String(last[idField]),
    });
  }
  return { rows: page, next };
}
