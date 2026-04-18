/**
 * Check whether an error is a unique-constraint violation (HTTP 409).
 *
 * Uses a duck-typed status check rather than `instanceof HTTPException`
 * because HTTPException instances may not share a class identity across
 * bundled adapter packages (minification can rename the class).
 */
export function isUniqueConstraintError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { status?: unknown }).status === 409
  );
}
