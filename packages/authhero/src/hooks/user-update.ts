import { Context } from "hono";
import {
  DataAdapters,
  LogTypes,
  UserDataAdapter,
} from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { logMessage } from "../helpers/logging";
import { JSONHTTPException } from "../errors/json-http-exception";
import { HookRequest } from "../types/Hooks";
import { createTokenAPI } from "./helpers/token-api";
import { stripInternalUserFields } from "../helpers/hook-user-payload";
import { isTemplateHook, handleTemplateHook } from "./templatehooks";
import { builtInUserLinkingEnabled } from "../helpers/user-linking";
import { compareUsersByAge, repointPrimary } from "../helpers/users";

/**
 * Decorator applied by `addDataHooks` to `users.update`. Fires pre-update
 * hooks, then commits the update inside its own `data.transaction(...)` so
 * the write plus any follow-up email-based account linking are atomic.
 *
 * The single-field `linked_to` update fast-path at the top bypasses hooks to
 * avoid recursion when `commitUserHook` or the account-linking template call
 * back into `users.update`.
 */
export function createUserUpdateHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): UserDataAdapter["update"] {
  return async (tenant_id, user_id, updates) => {
    // Reject self-links unconditionally — a user pointing `linked_to` at its
    // own user_id corrupts identity resolution (the row becomes both primary
    // and secondary). Guard above the fast-path so direct writes via
    // `users.update({ linked_to })` are caught too.
    if ("linked_to" in updates && updates.linked_to === user_id) {
      throw new JSONHTTPException(400, {
        message: "Cannot link a user to itself",
      });
    }

    // If we're only updating linked_to, skip all hooks to avoid recursion
    if (Object.keys(updates).length === 1 && "linked_to" in updates) {
      return data.users.update(tenant_id, user_id, updates);
    }

    // Fetch the user before it's updated
    const user = await data.users.get(tenant_id, user_id);

    if (!user) {
      throw new JSONHTTPException(404, {
        message: "User not found",
      });
    }

    // Build request object once for reuse
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.var.ip || ctx.get("ip") || "",
      user_agent: ctx.var.useragent || ctx.get("useragent") || "",
      url: ctx.req.url,
    };

    // Call pre-user-update hooks if configured
    if (ctx.env.hooks?.onExecutePreUserUpdate) {
      try {
        await ctx.env.hooks.onExecutePreUserUpdate(
          {
            ctx,
            tenant: { id: tenant_id },
            user_id,
            user: stripInternalUserFields(user),
            updates,
            request,
          },
          {
            user: {
              setUserMetadata: async (key, value) => {
                updates[key] = value;
              },
            },
            cancel: () => {
              throw new JSONHTTPException(400, {
                message: "User update cancelled by pre-update hook",
              });
            },
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        logMessage(ctx, tenant_id, {
          type: LogTypes.ACTIONS_EXECUTION_FAILED,
          description: `Pre user update hook failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          userId: user_id,
        });
        throw new JSONHTTPException(400, {
          message: "Pre user update hook failed",
        });
      }
    }

    // Decide whether the built-in email→primary auto-link runs inside the
    // commit transaction. With "off", linking on email update only happens
    // via the `account-linking` template hook below.
    const builtInLinkingEnabled = await builtInUserLinkingEnabled(
      ctx,
      tenant_id,
      ctx.var.client_id,
    );

    // Wrap the update and potential account linking in a transaction
    await data.transaction(async (trxData) => {
      // If we get here, proceed with the update
      const updated = await trxData.users.update(tenant_id, user_id, updates);
      if (!updated) {
        throw new JSONHTTPException(404, {
          message: "User not found",
        });
      }

      // Built-in path: when an email field changed and built-in linking is
      // enabled, run the same lookup as commitUserHook, but excluding the
      // current user (they're already in the DB).
      if (builtInLinkingEnabled && (updates.email || updates.email_verified)) {
        const updatedUser = await trxData.users.get(tenant_id, user_id);
        if (
          updatedUser &&
          !updatedUser.linked_to &&
          updatedUser.email &&
          updatedUser.email_verified
        ) {
          const normalizedEmail = updatedUser.email.toLowerCase();
          const { users: matchingUsers } = await trxData.users.list(tenant_id, {
            page: 0,
            per_page: 10,
            include_totals: false,
            q: `email:${normalizedEmail}`,
          });

          // Exclude the current user from candidates
          const otherUsers = matchingUsers.filter((u) => u.user_id !== user_id);

          // Pick the OLDEST unlinked primary so duplicate-primary races
          // converge in a single pass — adapter list ordering can otherwise
          // return a newer duplicate first and flip the wrong direction.
          const directPrimaries = otherUsers.filter((u) => !u.linked_to);
          const primaryCandidate =
            directPrimaries.length > 0
              ? [...directPrimaries].sort(compareUsersByAge)[0]
              : undefined;

          if (primaryCandidate) {
            // Older account stays primary. If the user being updated
            // pre-dates the candidate, the candidate is the duplicate and
            // gets demoted; otherwise the current user becomes secondary.
            // Without this comparison, the "current user is always the
            // secondary" rule could flip an existing primary into a
            // secondary of a newer duplicate.
            if (compareUsersByAge(updatedUser, primaryCandidate) < 0) {
              await repointPrimary({
                userAdapter: trxData.users,
                tenant_id,
                formerPrimary: primaryCandidate,
                newPrimaryId: user_id,
              });
            } else {
              await trxData.users.update(tenant_id, user_id, {
                linked_to: primaryCandidate.user_id,
              });
            }
          } else if (otherUsers.some((u) => u.linked_to)) {
            // All other matching users are already linked — resolve each
            // chain to its root and pick the OLDEST root so multiple chains
            // for the same email converge onto one primary.
            const roots: typeof otherUsers = [];
            const seen = new Set<string>();
            for (const u of otherUsers) {
              if (!u.linked_to) continue;
              const visited = new Set<string>([u.user_id]);
              let current = await trxData.users.get(tenant_id, u.linked_to);
              while (current && current.linked_to) {
                if (visited.has(current.user_id)) {
                  current = null;
                  break;
                }
                visited.add(current.user_id);
                current = await trxData.users.get(
                  tenant_id,
                  current.linked_to,
                );
              }
              if (current && current.user_id !== user_id && !seen.has(current.user_id)) {
                seen.add(current.user_id);
                roots.push(current);
              }
            }
            const resolvedPrimary =
              roots.length > 0 ? roots.sort(compareUsersByAge)[0] : undefined;
            if (resolvedPrimary) {
              // Same age check as the primary-candidate branch above.
              if (compareUsersByAge(updatedUser, resolvedPrimary) < 0) {
                await repointPrimary({
                  userAdapter: trxData.users,
                  tenant_id,
                  formerPrimary: resolvedPrimary,
                  newPrimaryId: user_id,
                });
              } else {
                await trxData.users.update(tenant_id, user_id, {
                  linked_to: resolvedPrimary.user_id,
                });
              }
            }
          }
        }
      }
    });

    // Template hooks at `post-user-update` run after the transaction commits.
    // The `account-linking` template uses ctx-bound adapters for its own
    // lookups; running it inside the trx would risk fighting the in-progress
    // commit and would also nest data.transaction calls.
    {
      const { hooks: allHooks } = await data.hooks.list(tenant_id, {
        q: "trigger_id:post-user-update",
        page: 0,
        per_page: 100,
        include_totals: false,
      });
      const enabledTemplateHooks = allHooks.filter(
        (h: unknown) =>
          isTemplateHook(h) && (h as { enabled: boolean }).enabled === true,
      );
      if (enabledTemplateHooks.length > 0) {
        const updatedUser = await data.users.get(tenant_id, user_id);
        if (updatedUser) {
          let cursor = updatedUser;
          for (const hook of enabledTemplateHooks) {
            if (!isTemplateHook(hook)) continue;
            try {
              cursor = await handleTemplateHook(
                ctx,
                hook.template_id,
                cursor,
                hook.metadata,
              );
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              const stack = err instanceof Error ? err.stack : undefined;
              const errorName = err instanceof Error ? err.name : undefined;
              logMessage(ctx, tenant_id, {
                type: LogTypes.ACTIONS_EXECUTION_FAILED,
                description: `Post user update template hook ${hook.template_id} failed: ${message}`,
                userId: user_id,
                details: {
                  template_id: hook.template_id,
                  trigger_id: "post-user-update",
                  error: message,
                  error_name: errorName,
                  error_stack: stack,
                },
              });
            }
          }
        }
      }
    }

    if (updates.email) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.SUCCESS_CHANGE_EMAIL,
        description: `Email updated to ${updates.email}`,
        userId: user_id,
      });
    }

    return true;
  };
}
