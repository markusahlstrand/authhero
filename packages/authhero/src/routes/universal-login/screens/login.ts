/**
 * Login screen - combined identifier + password screen (Identifier + Password flow)
 *
 * This screen shows email/username input, password input, and social login buttons
 * all on a single page. Used when identifier_first is set to false.
 *
 * Corresponds to: /u2/login
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import {
  getConnectionIdentifierConfig,
  Strategy,
  StrategyType,
} from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import {
  getPrimaryUserByProvider,
  getPrimaryUserByEmail,
} from "../../../helpers/users";
import { validateSignupEmail } from "../../../hooks";
import { getConnectionFromIdentifier } from "../../../utils/username";
import { createTranslation } from "../../../i18n";
import type { LoginScreen } from "../../../generated/locale-types";
import { getConnectionIconUrl } from "../../../strategies";
import { loginWithPassword } from "../../../authentication-flows/password";
import { AuthError } from "../../../types/AuthError";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createFrontChannelAuthResponse } from "../../../authentication-flows/common";
import {
  getRpId,
  buildConditionalMediationScript,
  buildWebAuthnConditionalMediationCeremony,
  verifyPasskeyAuthentication,
} from "./passkey-utils";

/**
 * Build social login buttons from available connections
 */
function buildSocialButtons(
  context: ScreenContext,
  m: LoginScreen,
): FormNodeComponent[] {
  const { connections } = context;

  const socialConnections = connections.filter(
    (c) => c.strategy !== Strategy.USERNAME_PASSWORD,
  );

  if (socialConnections.length === 0) {
    return [];
  }

  const passwordlessUrl = `${context.routePrefix}/login/login-passwordless-identifier?state=${encodeURIComponent(context.state)}`;

  // Separate passwordless and social connections to dedupe passwordless into a single entry
  const passwordlessConnections = socialConnections.filter(
    (c) => c.strategy === Strategy.EMAIL || c.strategy === Strategy.SMS,
  );
  const nonPasswordlessConnections = socialConnections.filter(
    (c) => c.strategy !== Strategy.EMAIL && c.strategy !== Strategy.SMS,
  );

  // Create provider details with icon URLs and display names
  const providerDetails = nonPasswordlessConnections.map((conn) => {
    const displayName = conn.display_name || conn.name;
    return {
      name: conn.name,
      strategy: conn.strategy,
      display_name: m.federatedConnectionButtonText({
        connectionName: displayName,
      }),
      icon_url: getConnectionIconUrl(conn),
    };
  });

  // Add a single passwordless entry if any passwordless connections exist
  const firstPasswordless = passwordlessConnections[0];
  if (firstPasswordless) {
    providerDetails.push({
      name: firstPasswordless.name,
      strategy: firstPasswordless.strategy,
      display_name: m.enterACodeBtn(),
      icon_url: getConnectionIconUrl(firstPasswordless),
      href: passwordlessUrl,
    } as (typeof providerDetails)[number] & { href: string });
  }

  // Create a single SOCIAL component with all providers
  const providers = [
    ...nonPasswordlessConnections.map((conn) => conn.name),
    ...(firstPasswordless ? [firstPasswordless.name] : []),
  ];

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

  // Add divider if we have social buttons and a password connection
  const hasPasswordConnection = connections.some(
    (c) => c.strategy === Strategy.USERNAME_PASSWORD,
  );

  if (hasPasswordConnection) {
    const divider: FormNodeComponent = {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      order: 1,
      config: {
        text: m.separatorText(),
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
    routePrefix,
  } = context;

  // Initialize i18n with locale, custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation("login", "login", locale, customText);

  const socialButtons = buildSocialButtons(context, m);
  const socialButtonCount = socialButtons.length;

  // Check if we have a password connection
  const passwordConnection = context.connections.find(
    (c) => c.strategy === Strategy.USERNAME_PASSWORD,
  );
  const hasPasswordConnection = !!passwordConnection;
  const identifierConfig = getConnectionIdentifierConfig(passwordConnection);
  const requiresUsername = identifierConfig.usernameIdentifierActive;
  const requiresEmail = identifierConfig.emailIdentifierActive;

  // Determine the appropriate label/placeholder based on connection config
  const identifierLabel =
    requiresUsername && requiresEmail
      ? m.usernamePlaceholder()
      : requiresUsername
        ? m.usernamePlaceholder()
        : m.emailPlaceholder();

  const components: FormNodeComponent[] = [
    // Social login buttons (if any)
    ...socialButtons,
  ];

  // Only add email/password inputs if we have password connection
  if (hasPasswordConnection) {
    const usernameMessages = errors?.username
      ? [{ text: errors.username, type: "error" as const }]
      : undefined;
    const passwordMessages = errors?.password
      ? [{ text: errors.password, type: "error" as const }]
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
        messages: usernameMessages,
      },
      // Password input
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: m.passwordPlaceholder(),
        config: {
          placeholder: m.passwordPlaceholder(),
        },
        required: true,
        sensitive: true,
        order: socialButtonCount + 2,
        messages: passwordMessages,
      },
    );

    // Forgot password link (between password and submit)
    const forgotPasswordUrl = `${routePrefix}/reset-password/request?state=${encodeURIComponent(state)}`;
    components.push({
      id: "forgot-password-link",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: `<div class="forgot-password-link"><a href="${forgotPasswordUrl}">${m.forgotPasswordText()}</a></div>`,
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
        text: m.buttonText(),
      },
      order: socialButtonCount + 4,
    });
  }

  // Check if passkeys are enabled for conditional mediation
  const hasPasskeysEnabled = context.connections.some(
    (c) => c.options?.authentication_methods?.passkey?.enabled,
  );

  if (hasPasskeysEnabled) {
    // Add hidden fields for passkey credential submission
    components.push(
      {
        id: "credential-field",
        type: "TEXT" as const,
        category: "FIELD" as const,
        visible: false,
        config: {},
        order: components.length + 1,
      },
      {
        id: "action-field",
        type: "TEXT" as const,
        category: "FIELD" as const,
        visible: false,
        config: {},
        order: components.length + 2,
      },
    );

    // Add autocomplete="username webauthn" to the username field
    const usernameComponent = components.find((c) => c.id === "username");
    if (usernameComponent && "config" in usernameComponent) {
      (usernameComponent.config as Record<string, unknown>).autocomplete =
        "username webauthn";
    }
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
        content: `<div class="signup-link">${m.footerText()} <a href="${signupUrl}">${m.footerLinkText()}</a></div>`,
      },
      order: components.length + 1,
    });
  }

  const screen: UiScreen = {
    name: "login",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/login?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    description: m.description({
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

  // Generate conditional mediation WebAuthn options if passkeys enabled
  let extraScript: string | undefined;
  let ceremony: ReturnType<typeof buildWebAuthnConditionalMediationCeremony> | undefined;

  if (hasPasskeysEnabled) {
    const rpId = getRpId(context.ctx);

    const options = await generateAuthenticationOptions({
      rpID: rpId,
      userVerification: "preferred",
      timeout: 60000,
    });

    // Store the challenge in the login session
    const loginSession = await context.ctx.env.data.loginSessions.get(
      context.client.tenant.id,
      state,
    );
    if (loginSession) {
      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      await context.ctx.env.data.loginSessions.update(
        context.client.tenant.id,
        state,
        {
          state_data: JSON.stringify({
            ...stateData,
            webauthn_challenge: options.challenge,
          }),
        },
      );
    }

    const optionsJSON = JSON.stringify(options);
    extraScript = buildConditionalMediationScript(optionsJSON);
    ceremony = buildWebAuthnConditionalMediationCeremony(optionsJSON);
  }

  return {
    screen,
    branding,
    extraScript,
    ceremony,
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

      // Handle passkey authentication from conditional mediation
      const action = data["action-field"] as string;
      if (action === "passkey-authenticate") {
        const credentialJson = data["credential-field"] as string;
        const result = await verifyPasskeyAuthentication(
          context,
          credentialJson,
        );

        if (result.success) {
          const authResult = await createFrontChannelAuthResponse(ctx, {
            authParams: result.loginSession.authParams,
            user: result.primaryUser,
            client,
            loginSession: {
              ...result.loginSession,
              user_id: result.primaryUser.user_id,
            },
            authConnection: result.authConnection,
            authStrategy: {
              strategy: "passkey",
              strategy_type: StrategyType.DATABASE,
            },
          });

          const location = authResult.headers.get("location");
          const cookies = authResult.headers.getSetCookie?.() || [];
          if (location) return { redirect: location, cookies };
          return { response: authResult };
        }

        // On passkey failure, re-render login with error
        return {
          error: result.error,
          screen: await loginScreen({
            ...context,
            messages: [{ text: result.error, type: "error" as const }],
          }),
        };
      }

      const username = (data.username as string)?.toLowerCase()?.trim();
      const password = (data.password as string)?.trim();

      // Initialize i18n for validation/error messages
      const locale = context.language || "en";
      const { m } = createTranslation(
        "login",
        "login",
        locale,
        context.customText,
      );

      // Check if the password connection has username identifier enabled
      const passwordConnection = client.connections.find(
        (c) => c.strategy === Strategy.USERNAME_PASSWORD,
      );
      const identifierConfig =
        getConnectionIdentifierConfig(passwordConnection);
      const requiresUsername = identifierConfig.usernameIdentifierActive;

      // Validate username is provided
      if (!username) {
        const fieldLabel = requiresUsername ? m["no-email"]() : m["no-email"]();
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
        const errorMessage = m["no-password"]();
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
        const errorMsg = m.invalidIdentifier();
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
          const errorMsg = m.usernameTooShort({ min: String(minLength) });
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
          const errorMsg = m.usernameTooLong({ max: String(maxLength) });
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
        const errorMsg = m.invalidEmail();
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
        const errorMsg = m.passwordLoginNotAvailable();
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
          const errorMsg = m.userAccountDoesNotExist();
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

      // Get or create login session
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession) {
        const errorMsg = m.sessionExpired();
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

        let errorMessage = authError.message || m["wrong-credentials"]();

        if (
          authError.code === "INVALID_PASSWORD" ||
          authError.code === "USER_NOT_FOUND"
        ) {
          errorMessage = m["wrong-credentials"]();
        } else if (authError.code === "EMAIL_NOT_VERIFIED") {
          errorMessage = m.unverifiedEmail();
        } else if (authError.code === "TOO_MANY_FAILED_LOGINS") {
          errorMessage = m.tooManyFailedLogins();
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
