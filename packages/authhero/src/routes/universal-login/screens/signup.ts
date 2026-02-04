/**
 * Signup screen - for new user registration
 *
 * Corresponds to: /u/signup
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getCustomText, getErrorText } from "./custom-text-utils";

/**
 * Build social signup buttons from available connections
 */
function buildSocialButtons(context: ScreenContext): FormNodeComponent[] {
  const { customText, connections } = context;

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
  // Apply custom text for federated button text if available
  const providerDetails = socialConnections.map((conn) => {
    const displayName = conn.display_name || conn.name;
    const customButtonText = customText?.federatedConnectionButtonText
      ? getCustomText(
          customText,
          "federatedConnectionButtonText",
          `Continue with ${displayName}`,
          { connectionName: displayName },
        )
      : undefined;

    return {
      name: conn.name,
      strategy: conn.strategy,
      display_name: customButtonText || displayName,
      icon_url: conn.options?.icon_url,
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
    const dividerText = getCustomText(
      customText,
      "separatorText",
      "or",
      undefined,
    );
    const divider: FormNodeComponent = {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      order: 1,
      config: {
        text: dividerText,
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
  const { client, branding, state, baseUrl, prefill, errors, customText } =
    context;

  // Variables for text substitution
  const textVariables = {
    clientName: client.name || "the application",
    companyName: branding?.logo_url ? client.name : undefined,
  };

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

    // Get error hints with custom text support
    const emailError = errors?.email
      ? getErrorText(
          customText,
          errors.email.includes("@")
            ? "invalid-email-format"
            : errors.email.includes("already")
              ? "email-already-exists"
              : "no-email",
          errors.email,
          textVariables,
        )
      : undefined;

    const passwordError = errors?.password
      ? getErrorText(customText, "no-password", errors.password, textVariables)
      : undefined;

    components.push(
      // Email input
      {
        id: "email",
        type: "EMAIL",
        category: "FIELD",
        visible: true,
        label: getCustomText(
          customText,
          "emailPlaceholder",
          "Email address",
          textVariables,
        ),
        config: {
          placeholder: getCustomText(
            customText,
            "emailPlaceholder",
            "name@example.com",
            textVariables,
          ),
        },
        required: true,
        order: order++,
        hint: emailError,
      },
      // Password input
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: getCustomText(
          customText,
          "passwordPlaceholder",
          "Password",
          textVariables,
        ),
        config: {
          placeholder: getCustomText(
            customText,
            "passwordPlaceholder",
            "Create a password",
            textVariables,
          ),
          show_toggle: true,
        },
        required: true,
        sensitive: true,
        order: order++,
        hint: passwordError,
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
          text: getCustomText(
            customText,
            "buttonText",
            "Sign up",
            textVariables,
          ),
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
    title: getCustomText(
      customText,
      "title",
      "Create your account",
      textVariables,
    ),
    description: getCustomText(
      customText,
      "description",
      client.name ? `Sign up for ${client.name}` : "Sign up to continue",
      textVariables,
    ),
    components,
    links: [
      {
        id: "login",
        text: getCustomText(
          customText,
          "loginActionText",
          "Already have an account?",
          textVariables,
        ),
        linkText: getCustomText(
          customText,
          "loginActionLinkText",
          "Log in",
          textVariables,
        ),
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
