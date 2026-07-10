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
export interface CursorPayload {
  /**
   * Value of the sort column on the last row of the previous page. `null` when
   * that column was null on the boundary row. Absent for id-only ordering.
   */
  s?: string | number | null;
  /** Id of the last row of the previous page — the unique tiebreaker. */
  i: string;
}

function toBase64Url(input: string): string {
  // btoa expects a Latin1 string; encode UTF-8 first so non-ASCII ids survive.
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encode a keyset position into an opaque cursor token suitable for returning
 * as `next` and accepting back as `from`.
 */
export function encodeCursor(payload: CursorPayload): string {
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Decode an opaque cursor token. Returns `null` for malformed or unparseable
 * tokens so callers can fall back gracefully (e.g. start from the beginning)
 * instead of throwing on client-supplied input.
 */
export function decodeCursor(token: string): CursorPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token));
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.i === "string"
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
