/**
 * Signup screen - for new user registration
 *
 * Corresponds to: /u/signup
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";

/**
 * Build social signup buttons from available connections
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

  // Add divider if we have social buttons and password signup
  const hasPasswordSignup = context.connections.some(
    (c) => c.strategy === "Username-Password-Authentication",
  );

  if (hasPasswordSignup) {
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
 * Create the signup screen
 */
export async function signupScreen(context: ScreenContext): Promise<ScreenResult> {
  const { client, branding, state, baseUrl, prefill, errors } = context;

  const socialButtons = buildSocialButtons(context);
  const socialButtonCount = socialButtons.length;

  // Check if we have password signup available
  const hasPasswordSignup = context.connections.some(
    (c) => c.strategy === "Username-Password-Authentication",
  );

  const components: FormNodeComponent[] = [
    // Social signup buttons (if any)
    ...socialButtons,
  ];

  // Add form fields for password signup
  if (hasPasswordSignup) {
    let order = socialButtonCount + 1;

    components.push(
      // Email input
      {
        id: "email",
        type: "EMAIL",
        category: "FIELD",
        visible: true,
        label: "Email address",
        config: {
          placeholder: "name@example.com",
        },
        required: true,
        order: order++,
        hint: errors?.email,
      },
      // Password input
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Password",
        config: {
          placeholder: "Create a password",
          show_toggle: true,
        },
        required: true,
        sensitive: true,
        order: order++,
        hint: errors?.password,
      },
      // Confirm password input
      {
        id: "re_password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Confirm password",
        config: {
          placeholder: "Confirm your password",
          show_toggle: true,
        },
        required: true,
        sensitive: true,
        order: order++,
        hint: errors?.re_password,
      },
      // Submit button
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Sign up",
        },
        order: order++,
      },
    );
  }

  // Pre-fill email if provided
  if (prefill?.email) {
    const emailComponent = components.find((c) => c.id === "email");
    if (emailComponent && "config" in emailComponent) {
      (emailComponent.config as Record<string, unknown>).value = prefill.email;
    }
  }

  const screen: UiScreen = {
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/signup?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: "Create your account",
    description: client.name
      ? `Sign up for ${client.name}`
      : "Sign up to continue",
    components,
    links: [
      {
        id: "login",
        text: "Already have an account?",
        linkText: "Log in",
        href: `${baseUrl}/u2/login/identifier?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the signup screen
 */
export const signupScreenDefinition: ScreenDefinition = {
  id: "signup",
  name: "Sign Up",
  description: "New user registration screen",
  handler: {
    get: signupScreen,
    // POST handler would:
    // 1. Validate email is not taken
    // 2. Validate password meets requirements
    // 3. Create user
    // 4. Send verification email if required
    // 5. Complete login or show verification screen
  },
};
