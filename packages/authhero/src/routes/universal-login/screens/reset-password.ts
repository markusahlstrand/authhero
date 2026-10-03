/**
 * Reset Password screen - set new password after reset
 *
 * Corresponds to: /u/reset-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import bcryptjs from "bcryptjs";
import { getUsernamePasswordUser } from "../../../utils/username-password-provider";
import { recordPasswordReset } from "../../../authentication-flows/password";
import { logMessage } from "../../../helpers/logging";
import { resolvePasswordConnection } from "../../../helpers/password-connection";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
} from "../../../helpers/password-policy";
import { createTranslation } from "../../../i18n";
import { localizePasswordPolicyError } from "./signup";
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
  | { success: true }
  | {
      error: "user_not_found" | "code_expired" | "reset_failed";
      field: "code" | "password";
    }
  | { error: "password_policy"; field: "password"; policyError: unknown }
> {
  const { ctx, client, code, password, username } = params;
  const { env } = ctx;

  // Get the user
  const user = await getUsernamePasswordUser({
    env,
    tenant_id: client.tenant.id,
    username,
  });

  if (!user) {
    return { error: "user_not_found", field: "password" };
  }

  // Find the password connection by strategy
  const { connection: connectionName, connectionId } =
    resolvePasswordConnection(client, user.connection);

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
    return { error: "password_policy", field: "password", policyError };
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

    // Clear any failed-login lockout and stamp last_password_reset.
    await recordPasswordReset(env.data, client.tenant.id, user);

    // Log the successful password change. This flow never sets ctx.connection,
    // so pass the resolved connection explicitly — otherwise both connection
    // and connection_id come out empty.
    await logMessage(ctx, client.tenant.id, {
      type: LogTypes.SUCCESS_CHANGE_PASSWORD,
      description: `Password changed for ${user.email}`,
      userId: user.user_id,
      connection: connectionName,
      connection_id: connectionId,
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

    return { error: "reset_failed", field: "password" };
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
        const errorMessage = m.noPassword();
        return {
          error: errorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: errorMessage },
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
        const errorMessage = m.sessionExpired();
        return {
          error: errorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: errorMessage },
          }),
        };
      }

      // Validate the reset code is present
      const codeParam = context.data?.code as string | undefined;
      if (!codeParam) {
        const errorMessage = m.codeExpired();
        return {
          error: errorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: errorMessage },
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
        const redirectUrl = `${context.routePrefix}/login/identifier?state=${encodeURIComponent(state)}&message=password_reset_success`;
        return { redirect: redirectUrl };
      }

      const errorMessage =
        result.error === "code_expired"
          ? m.codeExpired()
          : result.error === "password_policy"
            ? localizePasswordPolicyError(
                result.policyError,
                locale,
                context.customText,
              )
            : m.failed();

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
