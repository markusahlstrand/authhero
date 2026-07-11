/**
 * Check whether an error walks and quacks like hono's HTTPException.
 *
 * Uses duck typing rather than `instanceof HTTPException` because adapter
 * packages (kysely, drizzle) bundle their own copy of hono, so exceptions
 * they throw don't share a class identity with the app's HTTPException.
 */
export function isHTTPExceptionLike(
  err: unknown,
): err is { status: number; getResponse: () => Response } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number" &&
    "getResponse" in err &&
    typeof err.getResponse === "function"
  );
}
