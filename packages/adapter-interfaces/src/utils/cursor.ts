/**
 * Opaque cursor encoding for keyset (checkpoint) pagination.
 *
 * Auth0's `from` parameter is an opaque token — "the Id from which to start
 * selection" — that a client takes verbatim from the previous response's
 * `next` field and passes back. It is NOT a numeric offset.
 *
 * We encode the keyset position (the sort-column value of the last returned
 * row plus its id as a tiebreaker) into a URL-safe base64 token. Keeping the
 * token opaque means clients cannot depend on its shape and we can evolve the
 * encoding — e.g. add extra sort keys — without breaking callers.
 */
import { decodeBase64UrlString, encodeBase64UrlString } from "./base64url";

export interface CursorPayload {
  /**
   * Value of the sort column on the last row of the previous page. `null` when
   * that column was null on the boundary row. Absent for id-only ordering.
   */
  s?: string | number | null;
  /** Id of the last row of the previous page — the unique tiebreaker. */
  i: string;
  /**
   * Sort spec the cursor was minted under (e.g. `date:desc`). Set by endpoints
   * that honor a caller-chosen sort in checkpoint mode, so a token replayed
   * with a different sort is rejected instead of silently returning pages from
   * the wrong position. Absent on fixed-sort endpoints.
   */
  k?: string;
}

/**
 * Encode a keyset position into an opaque cursor token suitable for returning
 * as `next` and accepting back as `from`.
 */
export function encodeCursor(payload: CursorPayload): string {
  return encodeBase64UrlString(JSON.stringify(payload));
}

/**
 * Decode an opaque cursor token. Returns `null` for malformed or unparseable
 * tokens so callers can fall back gracefully (e.g. start from the beginning)
 * instead of throwing on client-supplied input.
 */
export function decodeCursor(token: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(decodeBase64UrlString(token));
    if (parsed && typeof parsed === "object" && typeof parsed.i === "string") {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
