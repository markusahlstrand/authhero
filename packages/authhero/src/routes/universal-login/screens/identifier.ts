/**
 * Identifier screen - the first screen in the login flow
 *
 * Corresponds to: /u/login/identifier
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";

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

  // Create a single SOCIAL component with all providers
  const providers = socialConnections.map((conn) => conn.strategy);

  const socialButton: FormNodeComponent = {
    id: "social-buttons",
    type: "SOCIAL",
    category: "FIELD",
    visible: true,
    config: {
      providers,
    },
    order: 0,
  };

  // Add divider if we have social buttons and password/email login
  const hasPasswordOrEmail = context.connections.some(
    (c) =>
      c.strategy === "email" ||
      c.strategy === "Username-Password-Authentication",
  );

  if (hasPasswordOrEmail) {
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
export function identifierScreen(context: ScreenContext): ScreenResult {
  const { client, branding, state, baseUrl, prefill, errors } = context;

  const socialButtons = buildSocialButtons(context);
  const socialButtonCount = socialButtons.length;

  const components: FormNodeComponent[] = [
    // Social login buttons (if any)
    ...socialButtons,
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
  ];

  // Add signup link if signup is allowed
  const links: UiScreen["links"] = [];
  // Note: allow_signup check needs to be handled differently as it's not on Client type
  // For now, always show signup link
  links.push({
    id: "signup",
    text: "Don't have an account?",
    linkText: "Sign up",
    href: `${baseUrl}/u/signup?state=${encodeURIComponent(state)}`,
  });

  const screen: UiScreen = {
    action: `${baseUrl}/u/widget/identifier?state=${encodeURIComponent(state)}`,
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
    // POST handler would be implemented to:
    // 1. Validate email/username
    // 2. Check if user exists
    // 3. Determine next screen (enter-password, enter-code, signup, etc.)
  },
};
