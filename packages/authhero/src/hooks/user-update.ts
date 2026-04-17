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

/**
 * Decorator applied by `addDataHooks` to `users.update`. Fires pre-update
 * hooks, then commits the update inside its own `data.transaction(...)` so
 * the write plus any follow-up email-based account linking are atomic.
 *
 * The single-field `linked_to` update fast-path at the top bypasses hooks to
 * avoid recursion when `linkUsersHook` or the account-linking template call
 * back into `users.update`.
 */
export function createUserUpdateHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
): UserDataAdapter["update"] {
  return async (tenant_id, user_id, updates) => {
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

    // Wrap the update and potential account linking in a transaction
    await data.transaction(async (trxData) => {
      // If we get here, proceed with the update
      const updated = await trxData.users.update(tenant_id, user_id, updates);
      if (!updated) {
        throw new JSONHTTPException(404, {
          message: "User not found",
        });
      }

      // Check if email was updated or verified - if so, check for account linking
      // Uses the same matching approach as getPrimaryUserByEmail in linkUsersHook,
      // but excludes the current user from candidates (since they're already in the DB)
      if (updates.email || updates.email_verified) {
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

          // Find an unlinked primary user (consistent with getPrimaryUserByEmail)
          const primaryCandidate = otherUsers.find((u) => !u.linked_to);

          if (primaryCandidate) {
            await trxData.users.update(tenant_id, user_id, {
              linked_to: primaryCandidate.user_id,
            });
          } else if (otherUsers[0]?.linked_to) {
            // All other matching users are already linked — follow the chain
            // to find the actual primary (same as getPrimaryUserByEmail fallback)
            const resolvedPrimary = await trxData.users.get(
              tenant_id,
              otherUsers[0].linked_to,
            );
            if (resolvedPrimary) {
              await trxData.users.update(tenant_id, user_id, {
                linked_to: resolvedPrimary.user_id,
              });
            }
          }
        }
      }
    });

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
