/**
 * Reset Password screen - set new password after reset
 *
 * Corresponds to: /u/reset-password
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { LogTypes } from "@authhero/adapter-interfaces";
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

/**
 * Create the reset-password screen
 */
export async function resetPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, errors, messages, routePrefix } = context;

  const components: FormNodeComponent[] = [
    // New password input
    {
      id: "password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: "New password",
      config: {
        placeholder: "Enter new password",
        show_toggle: true,
      },
      required: true,
      sensitive: true,
      order: 0,
      hint: errors?.password,
    },
    // Confirm password input
    {
      id: "confirm_password",
      type: "PASSWORD",
      category: "FIELD",
      visible: true,
      label: "Confirm new password",
      config: {
        placeholder: "Confirm new password",
      },
      required: true,
      sensitive: true,
      order: 1,
      hint: errors?.confirm_password,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: "Reset password",
      },
      order: 2,
    },
  ];

  const screen: UiScreen = {
    name: "reset-password",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/reset-password?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Set your new password",
    description: "Choose a strong password for your account",
    components,
    messages: messages?.map((m) => ({ text: m.text, type: m.type })),
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
      const { m } = createTranslation(locale, context.customText);

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
        const errorMessage = m.create_account_passwords_didnt_match();
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

      // Get the user
      const user = await getUserByProvider({
        userAdapter: env.data.users,
        tenant_id: client.tenant.id,
        username: loginSession.authParams.username,
        provider: USERNAME_PASSWORD_PROVIDER,
      });

      if (!user) {
        return {
          error: "User not found",
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: "User not found" },
          }),
        };
      }

      // Find the password connection by strategy to get the correct connection name
      // This is needed because user.connection may contain "Username-Password-Authentication"
      // (a hardcoded fallback) instead of the actual connection name
      const passwordConnection = client.connections.find(
        (c) => c.strategy === "Username-Password-Authentication",
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
          policyError instanceof Error
            ? policyError.message
            : m.create_account_weak_password();

        return {
          error: errorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: errorMessage },
          }),
        };
      }

      // Validate the reset code
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

      const foundCode = await env.data.codes.get(
        client.tenant.id,
        codeParam,
        "password_reset",
      );

      if (!foundCode) {
        const errorMessage = m.code_expired();
        return {
          error: errorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: errorMessage },
          }),
        };
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

        // Delete the used code
        await env.data.codes.remove(client.tenant.id, foundCode.code_id);

        // Redirect to login with success message
        const redirectUrl = `/u2/identifier?state=${encodeURIComponent(state)}&message=password_reset_success`;
        return { redirect: redirectUrl };
      } catch (err) {
        // Log the failure
        const errorDetails =
          err instanceof Error ? err.message : JSON.stringify(err);
        await logMessage(ctx, client.tenant.id, {
          type: LogTypes.FAILED_CHANGE_PASSWORD,
          description: `Password reset failed for ${user.email}: ${errorDetails}`,
          userId: user.user_id,
        });

        const resetErrorMessage =
          err instanceof Error ? err.message : m.password_reset_failed();

        return {
          error: resetErrorMessage,
          screen: await resetPasswordScreen({
            ...context,
            errors: { password: resetErrorMessage },
          }),
        };
      }
    },
  },
};
