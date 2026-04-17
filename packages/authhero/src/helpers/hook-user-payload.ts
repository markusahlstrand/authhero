import { User } from "@authhero/adapter-interfaces";

export type ExternalUser = Omit<User, "registration_completed_at">;

/**
 * Remove fields that are tracked internally for self-healing/bookkeeping
 * but must never reach customer-facing payloads (webhooks, code hooks,
 * `onExecutePostLogin` event, outbox `target.after`, etc.).
 */
export function stripInternalUserFields(user: User): ExternalUser {
  const { registration_completed_at: _omit, ...rest } = user;
  return rest;
}
