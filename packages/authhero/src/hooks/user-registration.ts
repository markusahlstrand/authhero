import { Context } from "hono";
import { DataAdapters, LogTypes, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../types";
import { getEnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { JSONHTTPException } from "../errors/json-http-exception";
import { HookRequest } from "../types/Hooks";
import { enqueuePostHookEvent } from "../helpers/hook-events";
import { linkUsersHook } from "./link-users";
import { isCodeHook, handleCodeHook } from "./codehooks";
import { createTokenAPI } from "./helpers/token-api";
import { preUserSignupHook } from "./validate-signup";

/**
 * Decorator applied by `addDataHooks` to `users.create`. Runs the full
 * pre-commit/commit/publish pipeline for a user creation:
 *
 *  1. Pre-registration blocking hooks (outside any transaction so webhook
 *     latency and user-authored code don't hold a DB connection).
 *  2. `linkUsersHook` — the internal transactional step that atomically
 *     writes the user row (via `rawCreate`) and any auto-linking.
 *  3. Post-registration hooks — webhook delivery is handed to the outbox
 *     (`enqueuePostHookEvent`) for retryable / idempotent dispatch; code
 *     hooks currently still run inline with ctx.
 */
export function createUserHooks(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  data: DataAdapters,
) {
  return async (tenant_id: string, user: User) => {
    // Get the client_id from context if available (auth flows)
    // Management API calls won't have client_id, so skip validation in that case
    if (ctx.var.client_id) {
      const client = await getEnrichedClient(
        ctx.env,
        ctx.var.client_id,
        ctx.var.tenant_id,
      );

      // Call preUserSignupHook BEFORE any user creation logic
      // This ensures ALL signup methods (email, code, social) are checked
      // Only validate email-based signups (skip SMS/phone-based signups)
      if (user.email) {
        await preUserSignupHook(ctx, client, data, user.email, user.connection);
      }
    }

    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.req.query("x-real-ip") || "",
      user_agent: ctx.req.query("user-agent"),
      url: ctx.var.loginSession?.authorization_url || ctx.req.url,
    };

    if (ctx.env.hooks?.onExecutePreUserRegistration) {
      try {
        await ctx.env.hooks.onExecutePreUserRegistration(
          {
            ctx,
            user,
            request,
          },
          {
            user: {
              setUserMetadata: async (key, value) => {
                user[key] = value;
              },
              setLinkedTo: (primaryUserId: string) => {
                user.linked_to = primaryUserId;
              },
            },
            access: {
              deny: (code: string, reason?: string) => {
                throw new JSONHTTPException(400, {
                  message: reason
                    ? `Registration denied: ${code} - ${reason}`
                    : `Registration denied: ${code}`,
                });
              },
            },
            token: createTokenAPI(ctx, tenant_id),
          },
        );
      } catch (err) {
        if (err instanceof HTTPException) {
          throw err;
        }
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_SIGNUP,
          description: "Pre user registration hook failed",
        });
      }
    }

    // Execute pre-user-registration code hooks
    {
      const { hooks: allHooks } = await data.hooks.list(tenant_id, {
        q: "trigger_id:pre-user-registration",
        page: 0,
        per_page: 100,
        include_totals: false,
      });
      const preRegCodeHooks = allHooks
        .filter((h) => h.enabled)
        .filter(isCodeHook);
      for (const hook of preRegCodeHooks) {
        try {
          await handleCodeHook(
            ctx,
            data,
            hook,
            { ctx, user, request } as any,
            "pre-user-registration",
            {
              user: {
                setUserMetadata: (key: string, value: any) => {
                  (user as any)[key] = value;
                },
                setLinkedTo: (primaryUserId: string) => {
                  user.linked_to = primaryUserId;
                },
              },
              access: {
                deny: (code: string, reason?: string) => {
                  throw new JSONHTTPException(400, {
                    message: reason
                      ? `Registration denied: ${code} - ${reason}`
                      : `Registration denied: ${code}`,
                  });
                },
              },
            },
          );
        } catch (err) {
          if (err instanceof HTTPException) {
            throw err;
          }
          logMessage(ctx, tenant_id, {
            type: LogTypes.FAILED_SIGNUP,
            description: `Pre user registration code hook ${hook.hook_id} failed`,
          });
        }
      }
    }

    // Check for existing user with the same email and if so link the users
    const linkResult = await linkUsersHook(data)(tenant_id, user);

    // Race-loser: another concurrent create committed the row first.
    // Throw 409 so management-API clients see a duplicate error; auth flows
    // that want to recover (social callback) catch this in
    // getOrCreateUserByProvider and read back the winner's user.
    // Throwing here also skips post-registration hooks, preventing duplicate
    // outbox events for a single real registration.
    if (!linkResult.created) {
      throw new JSONHTTPException(409, { message: "User already exists" });
    }

    const result = linkResult.user;

    // Post-registration hooks run after the commit transaction inside
    // linkUsersHook has closed. They must not be invoked while holding a
    // transaction — webhook calls and user-authored action code can block
    // for seconds.
    const runPostHooks = async () => {
      if (ctx.env.hooks?.onExecutePostUserRegistration) {
        try {
          await ctx.env.hooks.onExecutePostUserRegistration(
            {
              ctx,
              user,
              request,
            },
            {
              user: {},
              token: createTokenAPI(ctx, tenant_id),
            },
          );
        } catch (err) {
          logMessage(ctx, tenant_id, {
            type: LogTypes.FAILED_SIGNUP,
            description: "Post user registration hook failed",
          });
        }
      }

      // Execute post-user-registration code hooks
      {
        const { hooks: allHooks } = await ctx.env.data.hooks.list(tenant_id, {
          q: "trigger_id:post-user-registration",
          page: 0,
          per_page: 100,
          include_totals: false,
        });
        const postRegCodeHooks = allHooks.filter(
          (h: any) => h.enabled && isCodeHook(h),
        );
        for (const hook of postRegCodeHooks) {
          if (!isCodeHook(hook)) continue;
          try {
            await handleCodeHook(
              ctx,
              ctx.env.data,
              hook,
              { ctx, user: result, request } as any,
              "post-user-registration",
              { user: {} },
            );
          } catch (err) {
            logMessage(ctx, tenant_id, {
              type: LogTypes.FAILED_SIGNUP,
              description: `Post user registration code hook ${hook.hook_id} failed`,
            });
          }
        }
      }

      // Hand post-user-registration webhook delivery to the outbox so it is
      // retried with backoff instead of firing inline. Idempotent delivery is
      // enforced via `Idempotency-Key: {event.id}` headers in WebhookDestination.
      enqueuePostHookEvent(ctx, tenant_id, "post-user-registration", result);
    };

    await runPostHooks();

    return result;
  };
}
