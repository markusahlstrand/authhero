/**
 * Identifier screen - the first screen in the login flow
 *
 * Corresponds to: /u/login/identifier
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
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
import { enterCodeScreen } from "./enter-code";
import { enterPasswordScreen } from "./enter-password";

/**
 * Build social login buttons from available connections
 */
function buildSocialButtons(context: ScreenContext): FormNodeComponent[] {
  const socialConnections = context.connections.filter(
    (c) =>
      c.strategy !== "email" &&
      c.strategy !== "sms" &&
      c.strategy !== "Username-Password-Authentication",
  );

  if (socialConnections.length === 0) {
    return [];
  }

  // Create provider details with icon URLs and display names
  const providerDetails = socialConnections.map((conn) => ({
    name: conn.name,
    strategy: conn.strategy,
    display_name: conn.display_name || conn.name,
    icon_url: conn.options?.icon_url,
  }));

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
  const hasPasswordOrEmailOrSms = context.connections.some(
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
  const { client, branding, state, baseUrl, prefill, errors } = context;

  const socialButtons = buildSocialButtons(context);
  const socialButtonCount = socialButtons.length;

  // Check if we have email/sms/password connections that need the identifier input
  const hasEmailOrPasswordConnection = context.connections.some(
    (c) =>
      c.strategy === "email" ||
      c.strategy === "sms" ||
      c.strategy === "Username-Password-Authentication",
  );

  const components: FormNodeComponent[] = [
    // Social login buttons (if any)
    ...socialButtons,
  ];

  // Only add email input and continue button if we have email/sms/password connections
  if (hasEmailOrPasswordConnection) {
    components.push(
      // Email/username input
      {
        id: "username",
        type: "EMAIL",
        category: "FIELD",
        visible: true,
        label: "Email address",
        config: {
          placeholder: "name@example.com",
        },
        required: true,
        order: socialButtonCount + 1,
        hint: errors?.username,
      },
      // Continue button
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Continue",
        },
        order: socialButtonCount + 2,
      },
    );
  }

  // Add signup link if signup is allowed
  const links: UiScreen["links"] = [];

  // Check if password signup is available
  const hasPasswordConnection = context.connections.some(
    (c) => c.strategy === "Username-Password-Authentication",
  );

  // Check if signups are disabled via client metadata
  const signupsDisabled = client.client_metadata?.disable_sign_ups === "true";

  // Only show signup link if signups are enabled AND password connection exists
  if (hasPasswordConnection && !signupsDisabled) {
    links.push({
      id: "signup",
      text: "Don't have an account?",
      linkText: "Sign up",
      href: `${baseUrl}/u2/signup?state=${encodeURIComponent(state)}`,
    });
  }

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    // Widget overrides this to POST JSON to screen API when hydrated
    action: `${baseUrl}/u2/login/identifier?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Welcome",
    description: client.name
      ? `Sign in to ${client.name}`
      : "Sign in to continue",
    components,
    links,
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

      // Validate username is provided
      if (!username) {
        return {
          error: "Email is required",
          screen: await identifierScreen({
            ...context,
            errors: { username: "Email is required" },
          }),
        };
      }

      // Parse the identifier to get connection type
      const countryCode = ctx.get("countryCode");
      const { normalized, connectionType, provider } =
        getConnectionFromIdentifier(username, countryCode);

      if (!normalized) {
        return {
          error: "Invalid identifier",
          screen: await identifierScreen({
            ...context,
            prefill: { username },
            errors: { username: "Invalid identifier" },
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

      // Check if connection is allowed
      const hasValidConnection =
        client.connections.find((c) => c.strategy === connectionType) || user;

      if (!hasValidConnection) {
        return {
          error: "Invalid identifier",
          screen: await identifierScreen({
            ...context,
            prefill: { username },
            errors: { username: "Invalid identifier" },
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
          return {
            error: validation.reason || "Account does not exist",
            screen: await identifierScreen({
              ...context,
              prefill: { username },
              errors: { username: "Account does not exist" },
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
        return {
          error: "Session expired",
          screen: await identifierScreen({
            ...context,
            prefill: { username },
            errors: { username: "Session expired. Please try again." },
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

      // Return appropriate next screen directly (no redirect for internal navigation)
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

      // Return enter-code screen directly (no redirect for internal navigation)
      return { screen: await enterCodeScreen(nextContext) };
    },
  },
};
