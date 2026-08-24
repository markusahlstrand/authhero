/**
 * Build a Lucene filter matching exactly one user id.
 *
 * A bare `user_id:${id}` interpolation lets an id containing spaces or Lucene
 * operators change the shape of the query — e.g. `x OR user_id:y` widens the
 * match to another user's rows. Quoting closes that: both the kysely and
 * drizzle parsers keep quoted text as one token (spaces included) and strip
 * the quotes before comparing.
 *
 * Quoting rather than backslash-escaping is deliberate — it is the only form
 * both adapters agree on. Kysely reverses `\x` escapes before comparing while
 * drizzle does not, so an escaped value would silently stop matching there.
 *
 * A literal `"` would terminate the quoted run, and no real user id contains
 * one, so any are dropped rather than escaped.
 */
export function userIdFilter(userId: string): string {
  return `user_id:"${userId.replace(/"/g, "")}"`;
}
