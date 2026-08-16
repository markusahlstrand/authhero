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

/**
 * Emails are case-insensitive identifiers: every lookup (identifier-first
 * login, `getPrimaryUserByEmail`, email-based auto-linking) lowercases its
 * input, so a mixed-case stored email is unreachable and spawns duplicate
 * accounts. Request-schema transforms only cover zod-validated bodies —
 * upstream-sourced emails (SCIM provisioning, Auth0 lazy migration, IdP
 * profiles) reach `users.create`/`users.update` unvalidated, so this wrapper
 * is the enforcement point for every write that flows through the app's
 * composed adapters.
 */
function withLowercasedEmail<T extends { email?: string }>(input: T): T {
  if (!input.email) {
    return input;
  }
  const lowercased = input.email.toLowerCase();
  return lowercased === input.email ? input : { ...input, email: lowercased };
}

/**
 * Wrap a raw `DataAdapters` with lifecycle hooks for user CRUD operations.
 *
 * Read methods and non-user entities pass through untouched. `users.create`,
 * `users.update`, and `users.remove` are replaced with decorated versions
 * that run pre/post hooks, apply the narrow transactional commits, and
 * dispatch post-event outbox messages. `users.rawCreate` is NOT decorated —
 * commit paths call it directly to bypass the hook layer by design (they
 * receive the payload already normalized by the decorated entry points).
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
