/**
 * Signup screen - for new user registration
 *
 * Corresponds to: /u/signup
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation, type Messages } from "../../../i18n";
import { getConnectionIconUrl } from "../../../constants/socialIcons";

/**
 * Build social signup buttons from available connections
 */
function buildSocialButtons(context: ScreenContext, m: Messages): FormNodeComponent[] {
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
      display_name: m.continue_with({ provider: displayName }),
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

  // Add divider if we have social buttons and password signup
  const hasPasswordSignup = connections.some(
    (c) => c.strategy === "Username-Password-Authentication",
  );

  if (hasPasswordSignup) {
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
 * Create the signup screen
 */
export async function signupScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, baseUrl, prefill, errors, customText } =
    context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(locale, customText);

  const socialButtons = buildSocialButtons(context, m);
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
        label: m.email_placeholder(),
        config: {
          placeholder: m.email_placeholder(),
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
        label: m.password(),
        config: {
          placeholder: m.password(),
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
        label: m.confirm_password(),
        config: {
          placeholder: m.confirm_password(),
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
          text: m.signup(),
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
    title: m.create_account_title(),
    description: m.create_account_description(),
    components,
    links: [
      {
        id: "login",
        text: m.sign_in(),
        linkText: m.login(),
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
