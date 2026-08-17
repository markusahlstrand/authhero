/**
 * Opaque cursor encoding for DynamoDB keyset (checkpoint) pagination.
 *
 * The SQL adapters encode a `(sortValue, id)` position because they resume a
 * walk with a row-value comparison in the WHERE clause. DynamoDB needs nothing
 * of the sort: a Query already returns `LastEvaluatedKey`, and feeding it back
 * as `ExclusiveStartKey` resumes exactly where the previous page stopped. That
 * key *is* the keyset position, so the cursor here wraps it directly instead of
 * reconstructing one.
 *
 * The token stays opaque either way — that is the whole of the contract in
 * `ListParams.from` — so the differing payload is an implementation detail no
 * caller can observe. Cursors are not portable between adapters, which is fine:
 * a `next` is only ever handed back to the deployment that minted it.
 */
import {
  decodeBase64UrlString,
  encodeBase64UrlString,
} from "@authhero/adapter-interfaces";

/** A DynamoDB `LastEvaluatedKey` / `ExclusiveStartKey`. */
export type DynamoKey = Record<string, string>;

/**
 * The query a cursor must belong to. Every tenant-scoped entity shares the
 * partition key `TENANT#{id}` and is separated only by its sort-key prefix, so
 * the prefix is part of a cursor's identity, not a detail.
 */
export interface CursorQuery {
  /** Partition key value the query filters on. */
  pk: string;
  /** GSI being queried, if any. Its keys are named `{indexName}PK`/`SK`. */
  indexName?: string;
  /** `begins_with` prefix applied to the sort key, if any. */
  skPrefix?: string;
}

/**
 * Encode a `LastEvaluatedKey` into an opaque cursor token suitable for
 * returning as `next` and accepting back as `from`.
 */
export function encodeDynamoCursor(key: Record<string, unknown>): string {
  return encodeBase64UrlString(JSON.stringify(key));
}

/**
 * Decode an opaque cursor token into an `ExclusiveStartKey`, verifying it was
 * minted by the same query that is now presenting it.
 *
 * Returns `null` for anything unusable so a client-supplied `from` degrades to
 * "start from the beginning" rather than throwing — matching `decodeCursor()`
 * in adapter-interfaces.
 *
 * The query check is not decoration. DynamoDB rejects a key that disagrees with
 * the query's key conditions ("The provided starting key does not match the
 * range key predicate", "...is invalid"), so without this an attacker-supplied
 * or merely stale `from` turns into an unhandled ValidationException — a 500
 * driven by a query parameter. Note that this validation is a robustness
 * measure, not a tenant boundary: DynamoDB already refuses a cursor whose
 * partition key differs from the one being queried, so a foreign cursor could
 * never read another tenant's rows. It fails cleanly here instead of loudly
 * there.
 */
export function decodeDynamoCursor(
  token: string,
  query: CursorQuery,
): DynamoKey | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeBase64UrlString(token));
  } catch {
    return null;
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  // Every key attribute in this schema is a string (see keys.ts — all are
  // template literals). Rejecting non-strings keeps a crafted payload from
  // reaching the SDK as a mistyped key.
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0) return null;
  if (!entries.every(([, value]) => typeof value === "string")) return null;
  const key = parsed as DynamoKey;

  // The base table keys are always required: DynamoDB needs them to restart a
  // query, including one running against a GSI.
  if (typeof key.PK !== "string" || typeof key.SK !== "string") return null;

  // Compare against whichever key pair the query actually filters on. For a GSI
  // query that is the index pair; `PK`/`SK` there identify the item, not the
  // query, so comparing them would reject every valid cursor.
  const pkAttr = query.indexName ? `${query.indexName}PK` : "PK";
  const skAttr = query.indexName ? `${query.indexName}SK` : "SK";

  const cursorPk = key[pkAttr];
  const cursorSk = key[skAttr];
  if (typeof cursorPk !== "string" || typeof cursorSk !== "string") return null;

  if (cursorPk !== query.pk) return null;
  if (query.skPrefix && !cursorSk.startsWith(query.skPrefix)) return null;

  return key;
}
