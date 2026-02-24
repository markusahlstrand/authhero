/**
 * Login screen - combined identifier + password screen (Identifier + Password flow)
 *
 * This screen shows email/username input, password input, and social login buttons
 * all on a single page. Used when identifier_first is set to false.
 *
 * Corresponds to: /u2/login
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import { getConnectionIdentifierConfig } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import {
  getPrimaryUserByProvider,
  getPrimaryUserByEmail,
} from "../../../helpers/users";
import { validateSignupEmail } from "../../../hooks";
import { getConnectionFromIdentifier } from "../../../utils/username";
import { createTranslation, type Messages } from "../../../i18n";
import { getConnectionIconUrl } from "../../../strategies";
import { loginWithPassword } from "../../../authentication-flows/password";
import { AuthError } from "../../../types/AuthError";

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
      c.strategy !== "email" &&
      c.strategy !== "sms" &&
      c.strategy !== "Username-Password-Authentication",
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
      display_name: m.login_id_federated_connection_button_text({
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
      c.strategy === "email" ||
      c.strategy === "sms" ||
      c.strategy === "Username-Password-Authentication",
  );

  if (hasPasswordOrEmailOrSms) {
    const divider: FormNodeComponent = {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      order: 1,
      config: {
        text: m.or(),
      },
    };
    return [socialButton, divider];
  }

  return [socialButton];
}

/**
 * Create the login screen (combined identifier + password)
 */
export async function loginScreen(
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
  const { m } = createTranslation(locale, customText, promptScreen || "login");

  const socialButtons = buildSocialButtons(context, m);
  const socialButtonCount = socialButtons.length;

  // Check if we have a password connection
  const passwordConnection = context.connections.find(
    (c) => c.strategy === "Username-Password-Authentication",
  );
  const hasPasswordConnection = !!passwordConnection;
  const identifierConfig = getConnectionIdentifierConfig(passwordConnection);
  const requiresUsername = identifierConfig.usernameIdentifierActive;
  const requiresEmail = identifierConfig.emailIdentifierActive;

  // Determine the appropriate label/placeholder based on connection config
  const identifierLabel =
    requiresUsername && requiresEmail
      ? m.email_or_username_placeholder()
      : requiresUsername
        ? m.username_placeholder()
        : m.email_placeholder();

  const components: FormNodeComponent[] = [
    // Social login buttons (if any)
    ...socialButtons,
  ];

  // Only add email/password inputs if we have password connection
  if (hasPasswordConnection) {
    // Get error hints
    const usernameError = errors?.username;
    const passwordError = errors?.password;

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
        hint: usernameError,
      },
      // Password input
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: m.password(),
        config: {
          placeholder: m.enter_password(),
        },
        required: true,
        sensitive: true,
        order: socialButtonCount + 2,
        hint: passwordError,
      },
    );

    // Forgot password link (between password and submit)
    const forgotPasswordUrl = `${routePrefix}/forgot-password?state=${encodeURIComponent(state)}`;
    components.push({
      id: "forgot-password-link",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div class="forgot-password-link"><a href="${forgotPasswordUrl}">${m.forgot_password_link()}</a></div>`,
      },
      order: socialButtonCount + 3,
    });

    // Continue button
    components.push({
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.continue(),
      },
      order: socialButtonCount + 4,
    });
  }

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
        content: `<div class="signup-link">${m.dont_have_account()} <a href="${signupUrl}">${m.create_new_account_link()}</a></div>`,
      },
      order: components.length + 1,
    });
  }

  const screen: UiScreen = {
    name: "login",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/login?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.login_id_title(),
    description: m.login_id_description({
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
 * Screen definition for the login screen
 */
export const loginScreenDefinition: ScreenDefinition = {
  id: "login",
  name: "Login",
  description: "Combined login screen with email, password, and social login",
  handler: {
    get: loginScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const username = (data.username as string)?.toLowerCase()?.trim();
      const password = (data.password as string)?.trim();

      // Initialize i18n for validation/error messages
      const locale = context.language || "en";
      const { m } = createTranslation(locale, context.customText);

      // Check if the password connection has username identifier enabled
      const passwordConnection = client.connections.find(
        (c) => c.strategy === "Username-Password-Authentication",
      );
      const identifierConfig = getConnectionIdentifierConfig(passwordConnection);
      const requiresUsername = identifierConfig.usernameIdentifierActive;

      // Validate username is provided
      if (!username) {
        const fieldLabel = requiresUsername
          ? m.no_email_or_username()
          : m.no_email();
        return {
          error: fieldLabel,
          screen: await loginScreen({
            ...context,
            errors: { username: fieldLabel },
          }),
        };
      }

      // Validate password is provided
      if (!password) {
        const errorMessage = m.no_password();
        return {
          error: errorMessage,
          screen: await loginScreen({
            ...context,
            prefill: { username },
            errors: { password: errorMessage },
          }),
        };
      }

      // Parse the identifier to get connection type
      const countryCode = ctx.get("countryCode");
      const { normalized, connectionType, provider } =
        getConnectionFromIdentifier(username, countryCode);

      if (!normalized) {
        const errorMsg = m.invalid_identifier();
        return {
          error: errorMsg,
          screen: await loginScreen({
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
          const errorMsg = m.username_too_short({ min: String(minLength) });
          return {
            error: errorMsg,
            screen: await loginScreen({
              ...context,
              prefill: { username },
              errors: { username: errorMsg },
            }),
          };
        }

        if (normalized.length > maxLength) {
          const errorMsg = m.username_too_long({ max: String(maxLength) });
          return {
            error: errorMsg,
            screen: await loginScreen({
              ...context,
              prefill: { username },
              errors: { username: errorMsg },
            }),
          };
        }
      }

      // If connectionType is "username" but username identifier is not active, reject
      if (connectionType === "username" && !requiresUsername) {
        const errorMsg = m.invalid_email();
        return {
          error: errorMsg,
          screen: await loginScreen({
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
              provider,
            });

      // Check if password connection is allowed
      if (!passwordConnection) {
        const errorMsg = m.password_login_not_available();
        return {
          error: errorMsg,
          screen: await loginScreen({
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
          const errorMsg = m.user_account_does_not_exist();
          return {
            error: validation.reason || errorMsg,
            screen: await loginScreen({
              ...context,
              prefill: { username },
              errors: { username: errorMsg },
            }),
          };
        }
      }

      // Get or create login session
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession) {
        const errorMsg = m.session_expired();
        return {
          error: errorMsg,
          screen: await loginScreen({
            ...context,
            prefill: { username },
            errors: { username: errorMsg },
          }),
        };
      }

      // Update the login session with the username
      loginSession.authParams.username = normalized;
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        loginSession,
      );

      try {
        const result = await loginWithPassword(
          ctx,
          client,
          {
            ...loginSession.authParams,
            password,
          },
          loginSession,
        );

        // Get the redirect URL from the response
        const location = result.headers.get("location");
        // Extract Set-Cookie headers to pass to the caller
        const cookies = result.headers.getSetCookie?.() || [];
        if (location) {
          return { redirect: location, cookies };
        }
        // For non-redirect responses (e.g., web_message mode), pass through directly
        return { response: result };
      } catch (e: unknown) {
        const authError = e as AuthError;

        let errorMessage = authError.message || m.invalid_password();

        if (
          authError.code === "INVALID_PASSWORD" ||
          authError.code === "USER_NOT_FOUND"
        ) {
          errorMessage = m.invalid_password();
        } else if (authError.code === "EMAIL_NOT_VERIFIED") {
          errorMessage = m.unverified_email();
        } else if (authError.code === "TOO_MANY_FAILED_LOGINS") {
          errorMessage = m.too_many_failed_logins();
        }

        return {
          error: errorMessage,
          screen: await loginScreen({
            ...context,
            prefill: { username },
            errors: { password: errorMessage },
          }),
        };
      }
    },
  },
};
