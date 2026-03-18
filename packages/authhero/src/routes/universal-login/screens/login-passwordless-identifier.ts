/**
 * Login Passwordless Identifier screen
 *
 * Collects email or phone number for passwordless (code-based) login.
 * Shown when the user clicks "Sign in with a code" from the password-first login screen.
 *
 * Corresponds to: /u2/login/login-passwordless-identifier
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import {
  getPrimaryUserByProvider,
  getPrimaryUserByEmail,
} from "../../../helpers/users";
import { validateSignupEmail } from "../../../hooks";
import { getConnectionFromIdentifier } from "../../../utils/username";
import generateOTP from "../../../utils/otp";
import { sendCode, sendLink } from "../../../emails";
import { OTP_EXPIRATION_TIME } from "../../../constants";
import { emailOtpChallengeScreen } from "./email-otp-challenge";
import { smsOtpChallengeScreen } from "./sms-otp-challenge";
import { createTranslation } from "../../../i18n";

/**
 * Create the login passwordless identifier screen
 */
export async function loginPasswordlessIdentifierScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    branding,
    state,
    prefill,
    errors,
    messages,
    customText,
    promptScreen,
    routePrefix,
  } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    locale,
    customText,
    promptScreen || "login-passwordless",
    "login-passwordless-identifier",
  );

  const hasEmailConnection = context.connections.some(
    (c) => c.strategy === "email",
  );
  const hasSmsConnection = context.connections.some(
    (c) => c.strategy === "sms",
  );

  // Determine the auth method description
  const authMethod =
    hasEmailConnection && hasSmsConnection
      ? m.auth_method_email_or_phone()
      : hasSmsConnection
        ? m.auth_method_phone()
        : m.auth_method_email();

  const components: FormNodeComponent[] = [];
  let order = 0;

  // Build the identifier input based on available connections
  if (hasSmsConnection && !hasEmailConnection) {
    // SMS only — show phone input with country code
    const errorMessages = errors?.username
      ? [{ text: errors.username, type: "error" as const }]
      : undefined;

    components.push({
      id: "username",
      type: "TEL",
      category: "FIELD",
      visible: true,
      label: m.phone_placeholder(),
      config: {
        placeholder: m.phone_placeholder(),
        default_country: context.ctx.get("countryCode") || "US",
      },
      required: true,
      order: order++,
      messages: errorMessages,
    });
  } else if (hasEmailConnection && !hasSmsConnection) {
    // Email only
    const errorMessages = errors?.username
      ? [{ text: errors.username, type: "error" as const }]
      : undefined;

    components.push({
      id: "username",
      type: "EMAIL",
      category: "FIELD",
      visible: true,
      label: m.email_placeholder(),
      config: {
        placeholder: m.email_placeholder(),
      },
      required: true,
      order: order++,
      messages: errorMessages,
    });
  } else {
    // Both email and SMS — show a TEL field with allow_email so the country
    // picker is available for phone numbers but emails are also accepted
    const errorMessages = errors?.username
      ? [{ text: errors.username, type: "error" as const }]
      : undefined;

    components.push({
      id: "username",
      type: "TEL",
      category: "FIELD",
      visible: true,
      label: m.email_or_phone_placeholder(),
      config: {
        placeholder: m.email_or_phone_placeholder(),
        default_country: context.ctx.get("countryCode") || "US",
        allow_email: true,
      },
      required: true,
      order: order++,
      messages: errorMessages,
    });
  }

  // Continue button
  components.push({
    id: "submit",
    type: "NEXT_BUTTON",
    category: "BLOCK",
    visible: true,
    config: {
      text: m.continue(),
    },
    order: order++,
  });

  // Back to login link
  const loginUrl = `${routePrefix}/login?state=${encodeURIComponent(state)}`;
  components.push({
    id: "back-to-login",
    type: "RICH_TEXT",
    category: "BLOCK",
    visible: true,
    config: {
      content: `<div class="back-link"><a href="${loginUrl}">${m.go_back()}</a></div>`,
    },
    order: order++,
  });

  const screen: UiScreen = {
    name: "login-passwordless-identifier",
    action: `${routePrefix}/login/login-passwordless-identifier?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.login_passwordless_title(),
    description: m.login_passwordless_description({ authMethod }),
    components,
    messages,
  };

  // Pre-fill username if provided
  if (prefill?.username) {
    const usernameComponent = screen.components.find(
      (c) => c.id === "username",
    );
    if (usernameComponent && "config" in usernameComponent) {
      (usernameComponent.config as Record<string, unknown>).value =
        prefill.username;
    }
  }

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the login passwordless identifier screen
 */
export const loginPasswordlessIdentifierScreenDefinition: ScreenDefinition = {
  id: "login-passwordless-identifier",
  name: "Login Passwordless Identifier",
  description:
    "Collects email or phone for passwordless code-based login",
  handler: {
    get: loginPasswordlessIdentifierScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const username = (data.username as string)?.toLowerCase()?.trim();

      const locale = context.language || "en";
      const { m } = createTranslation(
        locale,
        context.customText,
        "login-passwordless",
        "login-passwordless-identifier",
      );

      // Validate input is provided
      if (!username) {
        const hasSmsOnly =
          context.connections.some((c) => c.strategy === "sms") &&
          !context.connections.some((c) => c.strategy === "email");

        const errorMsg = hasSmsOnly ? m.no_phone() : m.no_email();
        return {
          error: errorMsg,
          screen: await loginPasswordlessIdentifierScreen({
            ...context,
            errors: { username: errorMsg },
          }),
        };
      }

      // Parse the identifier to get connection type
      const countryCode = ctx.get("countryCode");
      const { normalized, connectionType } = getConnectionFromIdentifier(
        username,
        countryCode,
      );

      if (!normalized) {
        const errorMsg = m.invalid_identifier();
        return {
          error: errorMsg,
          screen: await loginPasswordlessIdentifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      // Validate the connection type is available for passwordless
      if (connectionType === "username") {
        // Usernames can't be used for passwordless login
        const errorMsg = m.invalid_identifier();
        return {
          error: errorMsg,
          screen: await loginPasswordlessIdentifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      const connection = client.connections.find(
        (c) => c.strategy === connectionType,
      );

      if (!connection) {
        const errorMsg =
          connectionType === "sms" ? m.invalid_phone() : m.invalid_email();
        return {
          error: errorMsg,
          screen: await loginPasswordlessIdentifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      // Look up user
      const user =
        connectionType === "email"
          ? await getPrimaryUserByEmail({
              userAdapter: ctx.env.data.users,
              tenant_id: client.tenant.id,
              email: normalized,
            })
          : await getPrimaryUserByProvider({
              userAdapter: ctx.env.data.users,
              tenant_id: client.tenant.id,
              username: normalized,
              provider: "sms",
            });

      // Validate signup if user doesn't exist
      if (!user) {
        const validation = await validateSignupEmail(
          ctx,
          client,
          ctx.env.data,
          normalized,
          connectionType,
        );

        if (!validation.allowed) {
          const errorMsg =
            validation.reason || m.user_account_does_not_exist();
          return {
            error: errorMsg,
            screen: await loginPasswordlessIdentifierScreen({
              ...context,
              prefill: { username },
              errors: { username: m.user_account_does_not_exist() },
            }),
          };
        }
      }

      // Update the login session with the username
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession) {
        const errorMsg = m.session_expired();
        return {
          error: errorMsg,
          screen: await loginPasswordlessIdentifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      loginSession.authParams.username = normalized;
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        loginSession,
      );

      // Generate OTP
      let code_id = generateOTP();
      let existingCode = await ctx.env.data.codes.get(
        client.tenant.id,
        code_id,
        "otp",
      );

      while (existingCode) {
        code_id = generateOTP();
        existingCode = await ctx.env.data.codes.get(
          client.tenant.id,
          code_id,
          "otp",
        );
      }

      await ctx.env.data.codes.create(client.tenant.id, {
        code_id,
        code_type: "otp",
        login_id: loginSession.id,
        expires_at: new Date(Date.now() + OTP_EXPIRATION_TIME).toISOString(),
        redirect_uri: loginSession.authParams.redirect_uri,
      });

      // Extract language from ui_locales
      const language = loginSession.authParams?.ui_locales
        ?.split(" ")
        ?.map((locale: string) => locale.split("-")[0])[0];

      try {
        if (
          connectionType === "email" &&
          connection?.options?.authentication_method === "magic_link"
        ) {
          await sendLink(ctx, {
            to: normalized,
            code: code_id,
            authParams: loginSession.authParams,
            language,
          });
        } else {
          await sendCode(ctx, {
            to: normalized,
            code: code_id,
            language,
          });
        }
      } catch {
        // Clean up the created code on delivery failure
        await ctx.env.data.codes.remove(client.tenant.id, code_id);

        const errorMsg = m.invalid_identifier();
        return {
          error: errorMsg,
          screen: await loginPasswordlessIdentifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      // Build context for next screen
      const nextContext: ScreenContext = {
        ...context,
        prefill: { username: normalized, email: normalized },
        data: { email: normalized },
        errors: undefined,
      };

      // Return OTP challenge screen based on connection type
      if (connectionType === "sms") {
        return { screen: await smsOtpChallengeScreen(nextContext) };
      }
      return { screen: await emailOtpChallengeScreen(nextContext) };
    },
  },
};
