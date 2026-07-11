import { sql, SelectQueryBuilder, SqlBool } from "kysely";
import { HTTPException } from "hono/http-exception";
import {
  ListParams,
  decodeCursor,
  encodeCursor,
} from "@authhero/adapter-interfaces";

/**
 * Keyset (checkpoint) pagination for list queries — the Auth0 `from`/`take`
 * style. `from` is an OPAQUE cursor (see encodeCursor), decoded to a
 * `(sortValue, id)` position; `take` is the page size. We fetch `take + 1`
 * rows to detect whether another page follows and emit a `next` cursor,
 * absent on the last page.
 *
 * This is intentionally keyset-only. Offset pagination (page/per_page + total),
 * which the admin UI uses and which honors arbitrary user sort, stays in each
 * adapter untouched. Callers branch to this helper only when `from`/`take` is
 * present. The helper owns ORDER BY (sortColumn then idColumn as a unique
 * tiebreaker), so the passed query must not be pre-ordered.
 */
export function isKeysetRequest(params?: ListParams): boolean {
  return params?.from !== undefined || params?.take !== undefined;
}

export interface KeysetOptions {
  /** Column to sort by. Must be a real column on the queried table. */
  sortColumn: string;
  sortOrder: "asc" | "desc";
  /** Unique tiebreaker column; defaults to "id". */
  idColumn?: string;
  /**
   * Sort spec (e.g. `date:desc`) for endpoints that honor a caller-chosen sort
   * in checkpoint mode. Minted into the cursor; a cursor presented under a
   * different sort spec is rejected with a 400, because its keyset position is
   * meaningless in the new order. Omit on fixed-sort endpoints.
   */
  sortKey?: string;
}

export interface KeysetResult<Row> {
  rows: Row[];
  /** Page size actually applied. */
  limit: number;
  /** Opaque cursor for the next page; set only when more rows follow. */
  next?: string;
}

function clampSize(raw: number | undefined, fallback: number): number {
  const n =
    typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : NaN;
  return n >= 1 ? n : fallback;
}

export async function keysetPaginate<DB, TB extends keyof DB, O>(
  query: SelectQueryBuilder<DB, TB, O>,
  params: ListParams | undefined,
  options: KeysetOptions,
): Promise<KeysetResult<O>> {
  const { sortColumn, sortOrder } = options;
  const idColumn = options.idColumn ?? "id";
  const take = clampSize(params?.take, 50);

  let ordered = query
    .orderBy(sql.ref(sortColumn), sortOrder)
    .orderBy(sql.ref(idColumn), sortOrder);

  const cursor = params?.from ? decodeCursor(params.from) : null;
  if (cursor && cursor.k !== options.sortKey) {
    throw new HTTPException(400, {
      message:
        "The `from` cursor was issued under a different sort and cannot be used with this request",
    });
  }
  if (cursor) {
    if (cursor.s === undefined || cursor.s === null) {
      // Id-only ordering (or a null boundary): compare on the tiebreaker alone.
      ordered = ordered.where(
        sql.ref(idColumn),
        sortOrder === "asc" ? ">" : "<",
        cursor.i,
      );
    } else {
      // Row-value comparison keeps the keyset stable across the sort column and
      // its tiebreaker: (sort, id) </> (cursorSort, cursorId). Supported by
      // SQLite (>= 3.15) and MySQL/PlanetScale.
      const cmp = sortOrder === "asc" ? sql.raw(">") : sql.raw("<");
      ordered = ordered.where(
        sql<SqlBool>`(${sql.ref(sortColumn)}, ${sql.ref(idColumn)}) ${cmp} (${cursor.s}, ${cursor.i})`,
      );
    }
  }

  // One extra row tells us whether a further page exists.
  const fetched = await ordered.limit(take + 1).execute();
  const hasMore = fetched.length > take;
  const rows = hasMore ? fetched.slice(0, take) : fetched;

  let next: string | undefined;
  if (hasMore && rows.length > 0) {
    const last = rows[rows.length - 1] as Record<string, unknown>;
    const sortValue = last[sortColumn];
    next = encodeCursor({
      s:
        typeof sortValue === "string" ||
        typeof sortValue === "number" ||
        sortValue === null
          ? (sortValue as string | number | null)
          : String(sortValue),
      i: String(last[idColumn]),
      ...(options.sortKey !== undefined && { k: options.sortKey }),
    });
  }

  return { rows, limit: take, next };
}
