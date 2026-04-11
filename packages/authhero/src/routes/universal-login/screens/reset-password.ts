/**
 * Reset Password screen - set new password after reset
 *
 * Corresponds to: /u/reset-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes, Strategy } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import bcryptjs from "bcryptjs";
import { getUserByProvider } from "../../../helpers/users";
import { USERNAME_PASSWORD_PROVIDER } from "../../../constants";
import { logMessage } from "../../../helpers/logging";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
} from "../../../helpers/password-policy";
import { createTranslation } from "../../../i18n";
import type { Context } from "hono";
import type { Bindings, Variables } from "../../../types";
import type { EnrichedClient } from "../../../helpers/client";

/**
 * Shared helper to execute a password reset: validate code, validate policy,
 * update password, mark email verified, log, and delete code.
 */
export async function executePasswordReset(params: {
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>;
  client: EnrichedClient;
  code: string;
  password: string;
  username: string;
}): Promise<
  { success: true } | { error: string; field: "code" | "password" }
> {
  const { ctx, client, code, password, username } = params;
  const { env } = ctx;

  // Get the user
  const user = await getUserByProvider({
    userAdapter: env.data.users,
    tenant_id: client.tenant.id,
    username,
    provider: USERNAME_PASSWORD_PROVIDER,
  });

  if (!user) {
    return { error: "User not found", field: "password" };
  }

  // Find the password connection by strategy
  const passwordConnection = client.connections.find(
    (c) => c.strategy === Strategy.USERNAME_PASSWORD,
  );
  const connectionName = passwordConnection?.name || user.connection;

  // Validate password against connection policy
  const policy = await getPasswordPolicy(
    env.data,
    client.tenant.id,
    connectionName,
  );

  try {
    await validatePasswordPolicy(policy, {
      tenantId: client.tenant.id,
      userId: user.user_id,
      newPassword: password,
      userData: user,
      data: env.data,
    });
  } catch (policyError: unknown) {
    const errorMessage =
      policyError instanceof Error ? policyError.message : "Password too weak";
    return { error: errorMessage, field: "password" };
  }

  // Validate the reset code
  const foundCode = await env.data.codes.get(
    client.tenant.id,
    code,
    "password_reset",
  );

  if (!foundCode) {
    return { error: "code_expired", field: "code" };
  }

  // Atomically claim the code so no concurrent request can reuse it
  const consumed = await env.data.codes.consume(
    client.tenant.id,
    foundCode.code_id,
  );

  if (!consumed) {
    return { error: "code_expired", field: "code" };
  }

  try {
    // Mark old password as not current (for password history)
    const existingPassword = await env.data.passwords.get(
      client.tenant.id,
      user.user_id,
    );
    if (existingPassword) {
      await env.data.passwords.update(client.tenant.id, {
        id: existingPassword.id,
        user_id: user.user_id,
        password: existingPassword.password,
        algorithm: existingPassword.algorithm,
        is_current: false,
      });
    }

    // Create new password
    await env.data.passwords.create(client.tenant.id, {
      user_id: user.user_id,
      password: await bcryptjs.hash(password, 10),
      algorithm: "bcrypt",
      is_current: true,
    });

    // Mark email as verified if it wasn't
    if (!user.email_verified) {
      await env.data.users.update(client.tenant.id, user.user_id, {
        email_verified: true,
      });
    }

    // Log the successful password change
    await logMessage(ctx, client.tenant.id, {
      type: LogTypes.SUCCESS_CHANGE_PASSWORD,
      description: `Password changed for ${user.email}`,
      userId: user.user_id,
    });

    return { success: true };
  } catch (err) {
    // Log the failure
    const errorDetails =
      err instanceof Error ? err.message : JSON.stringify(err);
    await logMessage(ctx, client.tenant.id, {
      type: LogTypes.FAILED_CHANGE_PASSWORD,
      description: `Password reset failed for ${user.email}: ${errorDetails}`,
      userId: user.user_id,
    });

    return {
      error: err instanceof Error ? err.message : "Password reset failed",
      field: "password",
    };
  }
}

/**
 * Create the reset-password screen
 */
export async function resetPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, customText, routePrefix } =
    context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(
    "reset-password",
    "reset-password",
    locale,
    customText,
  );

  const components: FormNodeComponent[] = [
    // New password input
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.passwordLabel(),
      config: {
        placeholder: m.passwordPlaceholder(),
        show_toggle: true,
      },
      required: true,
      sensitive: true,
      order: 0,
      messages: errors?.password
        ? [{ text: errors.password, type: "error" as const }]
        : undefined,
    },
    // Confirm password input
    {
      id: "confirm_password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: m.confirmPasswordLabel(),
      config: {
        placeholder: m.confirmPasswordPlaceholder(),
      },
      required: true,
      sensitive: true,
      order: 1,
      messages: errors?.confirm_password
        ? [{ text: errors.confirm_password, type: "error" as const }]
        : undefined,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.buttonText(),
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "reset-password",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/reset-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: m.description(),
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the reset-password screen
 */
export const resetPasswordScreenDefinition: ScreenDefinition = {
  id: "reset-password",
  name: "Reset Password",
  description: "Set new password screen",
  handler: {
    get: resetPasswordScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const { env } = ctx;

      const password = (data.password as string)?.trim();
      const confirmPassword = (data.confirm_password as string)?.trim();

      // Initialize i18n for messages
      const locale = context.language || "en";
      const { m } = createTranslation(
        "reset-password",
        "reset-password",
        locale,
        context.customText,
      );

      // Validate password is provided
      if (!password) {
        return {
          error: "Password is required",
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: "Password is required" },
          }),
        };
      }

      // Validate passwords match
      if (password !== confirmPassword) {
        const errorMessage = m.passwordsDidntMatch();
        return {
          error: errorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { confirm_password: errorMessage },
          }),
        };
      }

      // Get the login session to find the username
      const loginSession = await env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession || !loginSession.authParams?.username) {
        return {
          error: "Session expired",
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: "Session expired. Please start over." },
          }),
        };
      }

      // Validate the reset code is present
      const codeParam = context.data?.code as string | undefined;
      if (!codeParam) {
        return {
          error: "Reset code not found",
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: "Reset code not found" },
          }),
        };
      }

      const result = await executePasswordReset({
        ctx,
        client,
        code: codeParam,
        password,
        username: loginSession.authParams.username,
      });

      if ("success" in result) {
        const redirectUrl = `/u2/identifier?state=${encodeURIComponent(state)}&message=password_reset_success`;
        return { redirect: redirectUrl };
      }

      const errorMessage =
        result.error === "code_expired" ? m.codeExpired() : result.error;

      return {
        error: errorMessage,
        screen: await resetPasswordScreen({
          ...context,
          errors: { [result.field]: errorMessage },
        }),
      };
    },
  },
};
