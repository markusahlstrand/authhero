import { Context } from "hono";
import {
  DataAdapters,
  LogTypes,
  StrategyType,
} from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../types";
import { logMessage } from "../helpers/logging";
import { JSONHTTPException } from "../errors/json-http-exception";
import { HookRequest } from "../types/Hooks";
import { enqueuePostHookEvent } from "../helpers/hook-events";
import { preUserDeletionWebhook } from "./webhooks";
import { createTokenAPI } from "./helpers/token-api";
import { stripInternalUserFields } from "../helpers/hook-user-payload";

/**
 * Decorator applied by `addDataHooks` to `users.remove`. Runs pre-deletion
 * hooks (outside any transaction), then executes the unlink-secondaries +
 * delete-primary inside a single `data.transaction` so the user graph is
 * never left half-demolished. Post-deletion webhook delivery is handed to
 * the outbox for retryable dispatch.
 */
export function createUserDeletionHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user_id: string) => {
    // Get user details before deletion for logging and hooks
    const userToDelete = await data.users.get(tenant_id, user_id);

    // If user doesn't exist, return false immediately
    if (!userToDelete) {
      return false;
    }

    // Build request object for hooks
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.var.ip || ctx.get("ip") || "",
      user_agent: ctx.var.useragent || ctx.get("useragent") || "",
      url: ctx.req.url,
    };

    // Call pre-user-deletion hook if configured
    if (ctx.env.hooks?.onExecutePreUserDeletion) {
      try {
        await ctx.env.hooks.onExecutePreUserDeletion(
          {
            ctx,
            user: stripInternalUserFields(userToDelete),
            user_id,
            request,
            tenant: {
              id: tenant_id,
            },
          },
          {
            cancel: () => {
              throw new JSONHTTPException(400, {
                message: "User deletion cancelled by pre-deletion hook",
              });
            },
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        if (err instanceof HTTPException) {
          throw err;
        }
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_HOOK,
          description: `Pre user deletion hook failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        throw new JSONHTTPException(400, {
          message: "Pre user deletion hook failed",
        });
      }
    }

    // Invoke pre-user-deletion webhooks
    try {
      await preUserDeletionWebhook(ctx)(tenant_id, userToDelete);
    } catch (err) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.FAILED_HOOK,
        description: `Pre user deletion webhook failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw new JSONHTTPException(400, {
        message: "Pre user deletion webhook failed",
      });
    }

    // Unlink secondary users + remove the primary atomically. No external
    // I/O inside this transaction — webhooks and user code already ran in
    // the pre-deletion phase above.
    const result = await data.transaction(async (trxData) => {
      const linkedUsers = await trxData.users.list(tenant_id, {
        q: `linked_to:${user_id}`,
      });
      for (const linkedUser of linkedUsers.users) {
        const [provider, ...rest] = linkedUser.user_id.split("|");
        if (provider) {
          await trxData.users.unlink(
            tenant_id,
            user_id,
            provider,
            rest.join("|"),
          );
        }
      }
      return trxData.users.remove(tenant_id, user_id);
    });

    if (result) {
      logMessage(ctx, tenant_id, {
        type: LogTypes.SUCCESS_USER_DELETION,
        description: `Deleted user: ${userToDelete.email || user_id}`,
        userId: user_id,
        strategy: userToDelete.provider || "auth0",
        strategy_type: userToDelete.is_social
          ? StrategyType.SOCIAL
          : StrategyType.DATABASE,
        connection: userToDelete.connection || "",
        body: {
          tenant: tenant_id,
          connection: userToDelete.connection || "",
        },
      });
    }

    // Post-deletion hooks run after the commit transaction has closed.
    if (result) {
      // Webhook delivery is enqueued via the outbox so it retries with backoff
      // rather than firing inline.
      enqueuePostHookEvent(ctx, tenant_id, "post-user-deletion", userToDelete);

      if (ctx.env.hooks?.onExecutePostUserDeletion) {
        try {
          await ctx.env.hooks.onExecutePostUserDeletion(
            {
              ctx,
              user: stripInternalUserFields(userToDelete),
              user_id,
              request,
              tenant: {
                id: tenant_id,
              },
            },
            {
              token: createTokenAPI(ctx, tenant_id),
            },
          );
        } catch (err) {
          logMessage(ctx, tenant_id, {
            type: LogTypes.FAILED_HOOK,
            description: `Post user deletion hook failed: ${err instanceof Error ? err.message : String(err)}`,
          });
          // Don't throw - user is already deleted
        }
      }
    }

    return result;
  };
}
