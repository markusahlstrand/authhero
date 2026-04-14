import { Context } from "hono";
import { DataAdapters } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { createUserHooks } from "./user-registration";
import { createUserUpdateHooks } from "./user-update";
import { createUserDeletionHooks } from "./user-deletion";

/**
 * Wrap a raw `DataAdapters` with lifecycle hooks for user CRUD operations.
 *
 * Read methods and non-user entities pass through untouched. `users.create`,
 * `users.update`, and `users.remove` are replaced with decorated versions
 * that run pre/post hooks, apply the narrow transactional commits, and
 * dispatch post-event outbox messages. `users.rawCreate` is NOT decorated —
 * commit paths call it directly to bypass the hook layer by design.
 */
export function addDataHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): DataAdapters {
  // Store reference to raw data adapter so hooks can bypass themselves
  const rawData = data;

  return {
    ...data,
    users: {
      ...data.users,
      create: createUserHooks(ctx, rawData),
      update: createUserUpdateHooks(ctx, rawData),
      remove: createUserDeletionHooks(ctx, rawData),
    },
  };
}
