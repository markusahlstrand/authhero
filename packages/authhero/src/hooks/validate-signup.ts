import { Context } from "hono";
import { DataAdapters, LogTypes } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import { EnrichedClient } from "../helpers/client";
import { getPrimaryUserByEmail } from "../helpers/users";
import { logMessage } from "../helpers/logging";
import { createServiceToken } from "../helpers/service-token";
import { JSONHTTPException } from "../errors/json-http-exception";
import { HookRequest } from "../types/Hooks";
import {
  preUserRegistrationWebhook,
  getValidateRegistrationUsernameWebhook,
} from "./webhooks";
import { createTokenAPI } from "./helpers/token-api";

/**
 * Validates if an email can be used for signup based on client settings.
 * This is a lightweight check that can be done early (e.g., on identifier page)
 * without committing to creating a user.
 *
 * Supports code-based hooks via onExecuteValidateRegistrationUsername
 *
 * @returns An object with `allowed` boolean and optional `reason` string
 */
export async function validateSignupEmail(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  data: DataAdapters,
  email: string,
  connection: string = "email",
  options: { identifierPreflight?: boolean } = {},
): Promise<{ allowed: boolean; reason?: string }> {
  // Check the disable_signup flag on the connection being used. The connection
  // is resolved by name; falling back to strategy lets the caller pass a bare
  // strategy ("email", "sms") when no explicit connection name is known.
  let connectionRecord = client.connections.find((c) => c.name === connection);
  if (!connectionRecord) {
    const strategyMatches = client.connections.filter(
      (c) => c.strategy === connection,
    );
    if (strategyMatches.length > 1) {
      // Picking one arbitrarily could apply the wrong disable_signup flag —
      // require the caller to pass an explicit connection name instead.
      return {
        allowed: false,
        reason: `Ambiguous connection: client has ${strategyMatches.length} connections with strategy "${connection}" (${strategyMatches
          .map((c) => c.name)
          .join(", ")}). Pass an explicit connection name.`,
      };
    }
    if (strategyMatches.length === 1) {
      connectionRecord = strategyMatches[0];
      console.warn(
        `[validate-signup] resolved connection by strategy fallback: strategy="${connection}" matched "${connectionRecord!.name}"`,
      );
    }
  }
  // On the identifier preflight, skip the gate for import_mode connections:
  // a missing local user there means "not migrated yet", not "new signup",
  // and the upstream password challenge is the real gate. The non-preflight
  // path (e.g. preUserSignupHook right before user creation) normally enforces
  // disable_signup, but when the create is driven by lazy migration
  // (`attemptUpstreamPasswordFallback` sets ctx.is_lazy_migration), the user
  // already exists upstream — treat it like a preflight skip.
  const skipForImportMode =
    (options.identifierPreflight === true ||
      ctx.var.is_lazy_migration === true) &&
    connectionRecord?.options?.import_mode === true;
  if (connectionRecord?.options?.disable_signup && !skipForImportMode) {
    const authorizeUrl = ctx.var.loginSession?.authorization_url;

    // Check if screen_hint=signup was specified in the authorization URL
    const isExplicitSignup =
      authorizeUrl &&
      new URL(authorizeUrl).searchParams.get("screen_hint") === "signup";

    // If screen_hint=signup was specified, allow the signup
    if (isExplicitSignup) {
      return { allowed: true };
    }

    // If there is another user with the same email, allow as they will be linked
    const existingUser = await getPrimaryUserByEmail({
      userAdapter: data.users,
      tenant_id: client.tenant.id,
      email,
    });

    if (!existingUser) {
      return {
        allowed: false,
        reason: "User account does not exist",
      };
    }
  }

  // Call code-based hook if configured
  if (ctx.env.hooks?.onExecuteValidateRegistrationUsername) {
    const request: HookRequest = {
      method: ctx.req.method,
      ip: ctx.var.ip || ctx.get("ip") || "",
      user_agent: ctx.var.useragent || ctx.get("useragent") || "",
      url: ctx.req.url,
    };

    let denied = false;
    let denyReason: string | undefined;

    try {
      await ctx.env.hooks.onExecuteValidateRegistrationUsername(
        {
          ctx,
          client,
          request,
          tenant: { id: client.tenant.id },
          user: { email, connection },
        },
        {
          deny: (reason?: string) => {
            denied = true;
            denyReason = reason;
          },
          token: createTokenAPI(ctx, client.tenant.id),
        },
      );

      if (denied) {
        return { allowed: false, reason: denyReason };
      }
    } catch (err) {
      // If hook throws, treat as denial
      return {
        allowed: false,
        reason: "Signup validation hook failed",
      };
    }
  }

  // Call webhook if configured
  const validateSignupEmailWebhook =
    await getValidateRegistrationUsernameWebhook(ctx, client.tenant.id);
  if (validateSignupEmailWebhook && "url" in validateSignupEmailWebhook) {
    try {
      // Create service token for webhook authentication
      const token = await createServiceToken(ctx, client.tenant.id, "webhook");

      const response = await fetch(validateSignupEmailWebhook.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: client.tenant.id,
          email,
          connection,
          client_id: client.client_id,
          trigger_id: "validate-registration-username",
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        return {
          allowed: false,
          reason: body || "Signup not allowed by webhook",
        };
      }

      // Check if webhook returned a denial
      const webhookResult = await response.json();
      if (webhookResult.allowed === false) {
        return {
          allowed: false,
          reason: webhookResult.reason || "Signup not allowed by webhook",
        };
      }
    } catch (err) {
      // Log webhook error but don't block signup
      logMessage(ctx, client.tenant.id, {
        type: LogTypes.FAILED_HOOK,
        description: "Validate signup email webhook failed",
      });
    }
  }

  return { allowed: true };
}

/**
 * Pre-user signup hook that runs RIGHT BEFORE user creation.
 * This runs for ALL signup methods (email/password, code, social, etc.)
 * and enforces signup policies and invokes webhooks.
 *
 * This hook is called from createUserHooks and will throw an HTTPException
 * if the signup should be blocked.
 */
export async function preUserSignupHook(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  client: EnrichedClient,
  data: DataAdapters,
  email: string,
  connection?: string,
) {
  // Re-validate signup eligibility at creation time
  const validation = await validateSignupEmail(
    ctx,
    client,
    data,
    email,
    connection,
  );

  if (!validation.allowed) {
    logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_SIGNUP,
      description: validation.reason || "Signup not allowed",
    });

    throw new JSONHTTPException(400, {
      message: validation.reason || "Signups are disabled for this connection",
    });
  }

  // Invoke pre-registration webhooks
  await preUserRegistrationWebhook(ctx)(client.tenant.id, email);
}
