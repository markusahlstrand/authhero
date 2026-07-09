/** Target entity types whose id identifies an affected user. For these, the
 *  flat log's `user_id` is the target (the user the operation acted on) rather
 *  than the actor — matching Auth0, e.g. "Delete a User" logs the deleted user.
 *  Shared by `helpers/logging.ts` (write path) and
 *  `outbox-destinations/logs.ts` (outbox transform) so the two never drift. */
export const USER_TARGET_TYPES = new Set(["user", "identity"]);
