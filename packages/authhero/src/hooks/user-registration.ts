import { Context } from "hono";
import { DataAdapters, LogTypes, User } from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import { Bindings, Variables } from "../types";
import { getEnrichedClient } from "../helpers/client";
import { logMessage } from "../helpers/logging";
import { JSONHTTPException } from "../errors/json-http-exception";
import { HookRequest } from "../types/Hooks";
import { enqueuePostHookEvent } from "../helpers/hook-events";
import { commitUserHook } from "./link-users";
import {
  isCodeHook,
  handleCodeHook,
  persistActionExecution,
  HandleCodeHookOutcome,
} from "./codehooks";
import { isTemplateHook, handleTemplateHook } from "./templatehooks";
import { createTokenAPI } from "./helpers/token-api";
import { preUserSignupHook } from "./validate-signup";
import { builtInUserLinkingEnabled } from "../helpers/user-linking";

/**
 * Decorator applied by `addDataHooks` to `users.create`. Runs the full
 * pre-commit/commit/publish pipeline for a user creation:
 *
 *  1. Pre-registration blocking hooks (outside any transaction so webhook
 *     latency and user-authored code don't hold a DB connection).
 *  2. `commitUserHook` — the internal transactional step that atomically
 *     writes the user row (via `rawCreate`) and, when the built-in
 *     email-based linking path is enabled, also resolves `linked_to` from
 *     the existing primary inside the same transaction.
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
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : undefined;
        const errorName = err instanceof Error ? err.name : undefined;
        logMessage(ctx, tenant_id, {
          type: LogTypes.FAILED_SIGNUP,
          description: `Pre user registration hook failed for ${user.email || user.phone_number || user.user_id}: ${message}`,
          userId: user.user_id,
          connection: user.connection,
          details: {
            error: message,
            error_name: errorName,
            error_stack: stack,
            user_email: user.email,
            user_phone_number: user.phone_number,
            user_provider: user.provider,
            user_connection: user.connection,
          },
        });
      }
    }

    // Execute pre-user-registration code hooks.
    // Fetch the full tenant hooks list (bundle-covered) and filter in memory
    // rather than passing a `q:` param that bypasses the bundle wrapper.
    {
      const { hooks: allHooks } = await data.hooks.list(tenant_id);
      const preRegCodeHooks = allHooks
        .filter((h) => h.trigger_id === "pre-user-registration" && h.enabled)
        .filter(isCodeHook);
      const outcomes: HandleCodeHookOutcome[] = [];
      for (const hook of preRegCodeHooks) {
        try {
          const outcome = await handleCodeHook(
            ctx,
            data,
            hook,
            { ctx, user, request },
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
          if (outcome) outcomes.push(outcome);
        } catch (err) {
          if (err instanceof HTTPException) {
            // api.access.deny — record before re-throwing so the canceled
            // execution is persisted and discoverable.
            outcomes.push({
              result: {
                action_name: hook.code_id,
                error: {
                  id: "access_denied",
                  msg: err instanceof Error ? err.message : String(err),
                },
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
              },
              logs: [],
              denied: true,
            });
            await persistActionExecution(
              data,
              tenant_id,
              "pre-user-registration",
              outcomes,
            );
            throw err;
          }
          const message = err instanceof Error ? err.message : String(err);
          outcomes.push({
            result: {
              action_name: hook.code_id,
              error: { id: "execution_threw", msg: message },
              started_at: new Date().toISOString(),
              ended_at: new Date().toISOString(),
            },
            logs: [],
            denied: false,
          });
        }
      }
      const executionId = await persistActionExecution(
        data,
        tenant_id,
        "pre-user-registration",
        outcomes,
      );
      if (executionId) {
        ctx.set("action_execution_id", executionId);
      }
    }

    // Decide whether the built-in email→primary auto-link runs inside the
    // commit transaction. Per-client `user_linking_mode` overrides the
    // service-level `userLinkingMode`. With "off", linking only happens via
    // the `account-linking` template hook below.
    const resolveEmailLinkedPrimary = await builtInUserLinkingEnabled(
      ctx,
      tenant_id,
      ctx.var.client_id,
    );

    const linkResult = await commitUserHook(data)(tenant_id, user, {
      resolveEmailLinkedPrimary,
    });

    // Race-loser: another concurrent create committed the row first.
    // Throw 409 so management-API clients see a duplicate error; auth flows
    // that want to recover (social callback) catch this in
    // getOrCreateUserByProvider and read back the winner's user.
    // Throwing here also skips post-registration hooks, preventing duplicate
    // outbox events for a single real registration.
    if (!linkResult.created) {
      throw new JSONHTTPException(409, { message: "User already exists" });
    }

    let result = linkResult.user;

    // Post-registration hooks run after the commit transaction inside
    // commitUserHook has closed. They must not be invoked while holding a
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
          const message = err instanceof Error ? err.message : String(err);
          const stack = err instanceof Error ? err.stack : undefined;
          const errorName = err instanceof Error ? err.name : undefined;
          logMessage(ctx, tenant_id, {
            type: LogTypes.FAILED_SIGNUP,
            description: `Post user registration hook failed for ${result.email || result.phone_number || result.user_id}: ${message}`,
            userId: result.user_id,
            connection: result.connection,
            details: {
              error: message,
              error_name: errorName,
              error_stack: stack,
              user_email: result.email,
              user_phone_number: result.phone_number,
              user_provider: result.provider,
              user_connection: result.connection,
            },
          });
        }
      }

      // Execute post-user-registration code and template hooks.
      // Bundle-friendly: fetch the full tenant hooks list and filter in JS
      // instead of passing a `q:` param.
      {
        const { hooks: allHooks } = await ctx.env.data.hooks.list(tenant_id);
        const postRegCodeHooks = allHooks.filter(
          (h: any) =>
            h.trigger_id === "post-user-registration" &&
            h.enabled &&
            isCodeHook(h),
        );
        const postRegOutcomes: HandleCodeHookOutcome[] = [];
        for (const hook of postRegCodeHooks) {
          if (!isCodeHook(hook)) continue;
          try {
            const outcome = await handleCodeHook(
              ctx,
              ctx.env.data,
              hook,
              { ctx, user: result, request },
              "post-user-registration",
              { user: {} },
            );
            if (outcome) postRegOutcomes.push(outcome);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            postRegOutcomes.push({
              result: {
                action_name: hook.code_id,
                error: { id: "execution_threw", msg: message },
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
              },
              logs: [],
              denied: false,
            });
          }
        }
        const postRegExecutionId = await persistActionExecution(
          ctx.env.data,
          tenant_id,
          "post-user-registration",
          postRegOutcomes,
        );
        if (postRegExecutionId) {
          ctx.set("action_execution_id", postRegExecutionId);
        }

        // Template hooks (e.g. `account-linking`) run after code hooks so
        // they observe any user-metadata or linked_to updates the code
        // hooks performed. Failures are logged but do not abort signup —
        // the post-registration phase is best-effort, mirroring code hooks.
        const postRegTemplateHooks = allHooks.filter(
          (h: any) =>
            h.trigger_id === "post-user-registration" &&
            h.enabled &&
            isTemplateHook(h),
        );
        for (const hook of postRegTemplateHooks) {
          if (!isTemplateHook(hook)) continue;
          try {
            result = await handleTemplateHook(
              ctx,
              hook.template_id,
              result,
              hook.metadata,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const stack = err instanceof Error ? err.stack : undefined;
            const errorName = err instanceof Error ? err.name : undefined;
            logMessage(ctx, tenant_id, {
              type: LogTypes.FAILED_SIGNUP,
              description: `Post user registration template hook ${hook.template_id} failed for ${result.email || result.phone_number || result.user_id}: ${message}`,
              userId: result.user_id,
              connection: result.connection,
              details: {
                template_id: hook.template_id,
                trigger_id: "post-user-registration",
                error: message,
                error_name: errorName,
                error_stack: stack,
                user_email: result.email,
              },
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
