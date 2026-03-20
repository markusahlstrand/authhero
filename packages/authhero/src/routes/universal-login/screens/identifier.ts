/**
 * Identifier screen - the first screen in the login flow
 *
 * Corresponds to: /u/login/identifier
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import {
  getConnectionIdentifierConfig,
  Strategy,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import {
  getPrimaryUserByProvider,
  getPrimaryUserByEmail,
} from "../../../helpers/users";
import { validateSignupEmail } from "../../../hooks";
import { getConnectionFromIdentifier } from "../../../utils/username";
import { getLoginStrategy } from "../common";
import generateOTP from "../../../utils/otp";
import { sendCode, sendLink } from "../../../emails";
import { OTP_EXPIRATION_TIME } from "../../../constants";
import { emailOtpChallengeScreen } from "./email-otp-challenge";
import { smsOtpChallengeScreen } from "./sms-otp-challenge";
import { magicLinkSentScreen } from "./magic-link-sent";
import { enterPasswordScreen } from "./enter-password";
import { createTranslation, type Messages } from "../../../i18n";
import { getConnectionIconUrl } from "../../../strategies";

/**
 * Build social login buttons from available connections
 */
function buildSocialButtons(
  context: ScreenContext,
  m: Messages,
): FormNodeComponent[] {
  const { connections } = context;

  const socialConnections = connections.filter(
    (c) =>
      c.strategy !== Strategy.EMAIL &&
      c.strategy !== Strategy.SMS &&
      c.strategy !== Strategy.USERNAME_PASSWORD,
  );

  if (socialConnections.length === 0) {
    return [];
  }

  // Create provider details with icon URLs and display names
  const providerDetails = socialConnections.map((conn) => {
    const displayName = conn.display_name || conn.name;
    return {
      name: conn.name,
      strategy: conn.strategy,
      display_name: m.login_id__federated_connection_button_text({
        connectionName: displayName,
      }),
      icon_url: getConnectionIconUrl(conn),
    };
  });

  // Create a single SOCIAL component with all providers
  const providers = socialConnections.map((conn) => conn.name);

  const socialButton: FormNodeComponent = {
    id: "social-buttons",
    type: "SOCIAL",
    category: "FIELD",
    visible: true,
    config: {
      providers,
      provider_details: providerDetails,
    },
    order: 0,
  };

  // Add divider if we have social buttons and password/email/sms login
  const hasPasswordOrEmailOrSms = connections.some(
    (c) =>
      c.strategy === Strategy.EMAIL ||
      c.strategy === Strategy.SMS ||
      c.strategy === Strategy.USERNAME_PASSWORD,
  );

  if (hasPasswordOrEmailOrSms) {
    const divider: FormNodeComponent = {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      order: 1,
      config: {
        text: m.login_id__separator_text(),
      },
    };
    return [socialButton, divider];
  }

  return [socialButton];
}

/**
 * Create the identifier screen
 */
export async function identifierScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    client,
    branding,
    state,
    prefill,
    errors,
    messages,
    customText,
    promptScreen,
    routePrefix,
  } = context;

  // Initialize i18n with locale, custom text overrides, and prompt screen for namespacing
  const locale = context.language || "en";
  const { m } = createTranslation(
    locale,
    customText,
    promptScreen || "login-id",
    "identifier",
  );

  const socialButtons = buildSocialButtons(context, m);
  const socialButtonCount = socialButtons.length;

  // Check if we have email/sms/password connections that need the identifier input
  const hasEmailOrPasswordConnection = context.connections.some(
    (c) =>
      c.strategy === Strategy.EMAIL ||
      c.strategy === Strategy.SMS ||
      c.strategy === Strategy.USERNAME_PASSWORD,
  );

  // Check if the password connection has username identifier enabled
  const passwordConnection = context.connections.find(
    (c) => c.strategy === Strategy.USERNAME_PASSWORD,
  );
  const identifierConfig = getConnectionIdentifierConfig(passwordConnection);
  const requiresUsername = identifierConfig.usernameIdentifierActive;
  const requiresEmail = identifierConfig.emailIdentifierActive;

  // Determine the appropriate label/placeholder based on connection config
  const identifierLabel =
    requiresUsername && requiresEmail
      ? m.login_id__username_or_email_placeholder()
      : requiresUsername
        ? m.login_id__username_placeholder()
        : m.login_id__email_placeholder();

  const components: FormNodeComponent[] = [
    // Social login buttons (if any)
    ...socialButtons,
  ];

  // Only add email input and continue button if we have email/sms/password connections
  if (hasEmailOrPasswordConnection) {
    const errorMessages = errors?.username
      ? [{ text: errors.username, type: "error" as const }]
      : undefined;

    components.push(
      // Email/username input
      {
        id: "username",
        type: requiresUsername ? "TEXT" : "EMAIL",
        category: "FIELD",
        visible: true,
        label: identifierLabel,
        config: {
          placeholder: identifierLabel,
        },
        required: true,
        order: socialButtonCount + 1,
        messages: errorMessages,
      },
      // Continue button
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: m.login_id__button_text(),
        },
        order: socialButtonCount + 2,
      },
    );
  }

  // Check if password signup is available
  const hasPasswordConnection = context.connections.some(
    (c) => c.strategy === Strategy.USERNAME_PASSWORD,
  );

  // Check if signups are disabled via client metadata
  const signupsDisabled = client.client_metadata?.disable_sign_ups === "true";

  // Add signup link as a component inside the form (not as a separate links section)
  if (hasPasswordConnection && !signupsDisabled) {
    const signupUrl = `${routePrefix}/signup?state=${encodeURIComponent(state)}`;
    components.push({
      id: "signup-link",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div class="signup-link">${m.login_id__footer_text()} <a href="${signupUrl}">${m.login_id__footer_link_text()}</a></div>`,
      },
      order: components.length + 1,
    });
  }

  const screen: UiScreen = {
    name: "identifier",
    // Action points to HTML endpoint for no-JS fallback
    // Widget overrides this to POST JSON to screen API when hydrated
    action: `${routePrefix}/login/identifier?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.login_id__title(),
    description: m.login_id__description({
      companyName:
        client.tenant.friendly_name || client.tenant.id || "AuthHero",
      clientName: client.name || "the application",
    }),
    components,
    messages,
  };

  // Pre-fill username if provided
  if (prefill?.username) {
    const usernameComponent = screen.components.find(
      (c) => c.id === "username",
    );
    if (usernameComponent && "config" in usernameComponent) {
      (usernameComponent.config as Record<string, unknown>).default_value =
        prefill.username;
    }
  }

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the identifier screen
 */
export const identifierScreenDefinition: ScreenDefinition = {
  id: "identifier",
  name: "Identifier",
  description: "First screen of the login flow - collects email/username",
  handler: {
    get: identifierScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const username = (data.username as string)?.toLowerCase()?.trim();

      // Check if the password connection has username identifier enabled
      const passwordConnection = client.connections.find(
        (c) => c.strategy === Strategy.USERNAME_PASSWORD,
      );
      const identifierConfig =
        getConnectionIdentifierConfig(passwordConnection);
      const requiresUsername = identifierConfig.usernameIdentifierActive;

      // Initialize i18n once for all error branches
      const locale = context.language || "en";
      const { m } = createTranslation(
        locale,
        context.customText,
        undefined,
        "identifier",
      );

      // Validate username is provided
      if (!username) {
        const fieldLabel = requiresUsername
          ? m.login_id__no_email_username()
          : m.login_id__no_email();
        return {
          error: fieldLabel,
          screen: await identifierScreen({
            ...context,
            errors: { username: fieldLabel },
          }),
        };
      }

      // Parse the identifier to get connection type
      const countryCode = ctx.get("countryCode");
      const { normalized, connectionType, provider } =
        getConnectionFromIdentifier(username, countryCode);

      if (!normalized) {
        const errorMsg = m.login_id__invalid_email_format();
        return {
          error: errorMsg,
          screen: await identifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      // Validate username length when connectionType is "username"
      if (connectionType === "username" && requiresUsername) {
        const minLength = identifierConfig.usernameMinLength;
        const maxLength = identifierConfig.usernameMaxLength;

        if (normalized.length < minLength) {
          const errorMsg = m.login_id__username_too_short({ min: String(minLength) });
          return {
            error: errorMsg,
            screen: await identifierScreen({
              ...context,
              prefill: { username },
              errors: { username: errorMsg },
            }),
          };
        }

        if (normalized.length > maxLength) {
          const errorMsg = m.login_id__username_too_long({ max: String(maxLength) });
          return {
            error: errorMsg,
            screen: await identifierScreen({
              ...context,
              prefill: { username },
              errors: { username: errorMsg },
            }),
          };
        }
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
              provider,
            });

      // Check if connection is allowed
      // For "username" connectionType, allow if password connection has username identifier active
      const hasValidConnection =
        client.connections.find((c) => c.strategy === connectionType) ||
        (connectionType === "username" && requiresUsername) ||
        user;

      if (!hasValidConnection) {
        const errorMsg = m.login_id__invalid_email_format();
        return {
          error: errorMsg,
          screen: await identifierScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

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
          const errorMsg = validation.reason || m.login_id__user_account_does_not_exist();
          return {
            error: errorMsg,
            screen: await identifierScreen({
              ...context,
              prefill: { username },
              errors: { username: m.login_id__user_account_does_not_exist() },
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
        const errorMsg = m.login_id__session_expired();
        return {
          error: errorMsg,
          screen: await identifierScreen({
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

      // Determine login strategy
      const loginStrategy = await getLoginStrategy(
        ctx,
        client,
        username,
        connectionType,
        data.login_selection as "code" | "password" | undefined,
      );

      // Build context for next screen
      const nextContext: ScreenContext = {
        ...context,
        prefill: { username: normalized, email: normalized },
        data: { email: normalized },
        errors: undefined,
      };

      // Return appropriate next screen directly
      if (loginStrategy === "password") {
        return { screen: await enterPasswordScreen(nextContext) };
      }

      // For code-based login, generate and send OTP
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

      const connection = client.connections.find(
        (p) => p.strategy === connectionType,
      );

      // Extract language from ui_locales
      const language = loginSession.authParams?.ui_locales
        ?.split(" ")
        ?.map((locale: string) => locale.split("-")[0])[0];

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

      // Return appropriate screen based on connection type and auth method
      if (connectionType === "sms") {
        return { screen: await smsOtpChallengeScreen(nextContext) };
      }
      if (connection?.options?.authentication_method === "magic_link") {
        return { screen: await magicLinkSentScreen(nextContext) };
      }
      return { screen: await emailOtpChallengeScreen(nextContext) };
    },
  },
};
