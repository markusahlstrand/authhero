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
export type DynamoKey = Record<string, unknown>;

/**
 * Encode a `LastEvaluatedKey` into an opaque cursor token suitable for
 * returning as `next` and accepting back as `from`.
 */
export function encodeDynamoCursor(key: DynamoKey): string {
  return encodeBase64UrlString(JSON.stringify(key));
}

/**
 * Decode an opaque cursor token back into an `ExclusiveStartKey`.
 *
 * Returns `null` for malformed input so a client-supplied `from` degrades to
 * "start from the beginning" rather than throwing — matching `decodeCursor()`
 * in adapter-interfaces. A cursor minted by a SQL adapter decodes to an object
 * that is not a DynamoDB key; it is rejected here rather than being passed to
 * DynamoDB as a bogus `ExclusiveStartKey`, which would surface as a validation
 * error from the SDK.
 */
export function decodeDynamoCursor(token: string): DynamoKey | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64UrlString(token));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    const key = parsed as Record<string, unknown>;
    // A DynamoDB key is a non-empty map of attribute names to scalars. The SQL
    // cursor payload ({ s, i, k }) carries no "PK", so this also filters it out.
    const entries = Object.entries(key);
    if (entries.length === 0) return null;
    const isScalar = (v: unknown) =>
      typeof v === "string" || typeof v === "number" || typeof v === "boolean";
    if (!entries.every(([, v]) => isScalar(v))) return null;
    if (!("PK" in key)) return null;
    return key;
  } catch {
    return null;
  }
}
