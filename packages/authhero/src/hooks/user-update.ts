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
              logMessage(ctx, tenant_id, {
                type: LogTypes.ACTIONS_EXECUTION_FAILED,
                description: `Post user update template hook ${hook.template_id} failed`,
                userId: user_id,
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
