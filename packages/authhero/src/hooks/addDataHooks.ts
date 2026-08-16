import { Context } from "hono";
import {
  DataAdapters,
  User,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { createUserHooks } from "./user-registration";
import { createUserUpdateHooks } from "./user-update";
import { createUserDeletionHooks } from "./user-deletion";
import { withLowercasedEmail } from "../utils/email";

/**
 * Wrap a raw `DataAdapters` with lifecycle hooks for user CRUD operations.
 *
 * Read methods and non-user entities pass through untouched. `users.create`,
 * `users.update`, and `users.remove` are replaced with decorated versions
 * that run pre/post hooks, apply the narrow transactional commits, and
 * dispatch post-event outbox messages. `users.rawCreate` is NOT decorated —
 * commit paths call it directly to bypass the hook layer by design.
 *
 * `email` is lowercased on the way in so the pre-commit hooks and lookups
 * (`preUserSignupHook`, the email→primary linking query) see the same
 * normalized value that will be stored. Hooks can assign `email` themselves
 * after this point, so the decorators normalize again just before their
 * commit — see `createUserHooks` / `createUserUpdateHooks`.
 */
export function addDataHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): DataAdapters {
  // Store reference to raw data adapter so hooks can bypass themselves
  const rawData = data;

  const createWithHooks = createUserHooks(ctx, rawData);
  const updateWithHooks: UserDataAdapter["update"] = createUserUpdateHooks(
    ctx,
    rawData,
  );

  return {
    ...data,
    users: {
      ...data.users,
      create: (tenant_id: string, user: User) =>
        createWithHooks(tenant_id, withLowercasedEmail(user)),
      update: (tenant_id, user_id, updates, options) =>
        updateWithHooks(
          tenant_id,
          user_id,
          withLowercasedEmail(updates),
          options,
        ),
      remove: createUserDeletionHooks(ctx, rawData),
    },
  };
}
