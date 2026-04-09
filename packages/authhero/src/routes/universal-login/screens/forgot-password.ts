/**
 * Forgot Password screen - initiate password reset
 *
 * Corresponds to: /u2/reset-password/request
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { getLoginPath } from "./types";
import { createTranslation } from "../../../i18n";
import { requestPasswordReset } from "../../../authentication-flows/password";

/**
 * Create the forgot-password screen
 */
export async function forgotPasswordScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const {
    branding,
    state,
    prefill,
    errors,
    messages,
    customText,
    routePrefix = "/u2",
  } = context;

  // Initialize i18n with locale and custom text overrides
  const locale = context.language || "en";
  const { m } = createTranslation(
    "reset-password",
    "reset-password",
    locale,
    customText,
  );
  const { m: loginM } = createTranslation("login", "login", locale, customText);

  const components: FormNodeComponent[] = [
    // Info text
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: m.description(),
      },
      order: 0,
    },
    // Email input
    {
      id: "email",
      type: "EMAIL",
      category: "FIELD",
      visible: true,
      label: m.emailPlaceholder(),
      config: {
        placeholder: m.emailPlaceholder(),
      },
      required: true,
      order: 1,
      messages: errors?.email
        ? [{ text: errors.email, type: "error" as const }]
        : undefined,
    },
    // Submit button
    {
      id: "submit",
      type: "NEXT_BUTTON",
      category: "BLOCK",
      visible: true,
      config: {
        text: m.buttonText(),
      },
      order: 2,
    },
  ];

  // Pre-fill email if provided
  if (prefill?.email) {
    const emailComponent = components.find((c) => c.id === "email");
    if (emailComponent && "config" in emailComponent) {
      (emailComponent.config as Record<string, unknown>).default_value =
        prefill.email;
    }
  }

  const screen: UiScreen = {
    name: "forgot-password",
    // Action points to HTML endpoint for no-JS fallback
    action: `${routePrefix}/reset-password/request?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.title(),
    components,
    messages: messages?.map((msg) => ({ text: msg.text, type: msg.type })),
    links: [
      {
        id: "back",
        text: m.backToLoginText(),
        linkText: loginM.buttonText(),
        href: `${await getLoginPath(context)}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}

/**
 * Screen definition for the forgot-password screen
 */
/**
 * Create the forgot-password success screen (email sent confirmation)
 */
async function forgotPasswordSentScreen(
  context: ScreenContext,
): Promise<ScreenResult> {
  const { branding, state, customText } = context;

  const locale = context.language || "en";
  const { m } = createTranslation(
    "reset-password",
    "reset-password",
    locale,
    customText,
  );
  const { m: loginM } = createTranslation("login", "login", locale, customText);

  const components: FormNodeComponent[] = [
    {
      id: "info",
      type: "RICH_TEXT",
      category: "BLOCK",
      visible: true,
      config: {
        content: m.successDescription(),
      },
      order: 0,
    },
  ];

  const screen: UiScreen = {
    name: "forgot-password",
    action: "",
    method: "GET",
    title: m.successTitle(),
    components,
    links: [
      {
        id: "back",
        text: m.backToLoginText(),
        linkText: loginM.buttonText(),
        href: `${await getLoginPath(context)}?state=${encodeURIComponent(state)}`,
      },
    ],
  };

  return {
    screen,
    branding,
  };
}

export const forgotPasswordScreenDefinition: ScreenDefinition = {
  id: "forgot-password",
  name: "Forgot Password",
  description: "Password reset request screen",
  handler: {
    get: forgotPasswordScreen,
    post: async (context, data) => {
      const { ctx, client, state } = context;

      const email = (data.email as string)?.trim();

      if (!email) {
        return {
          error: "Email is required",
          screen: await forgotPasswordScreen({
            ...context,
            errors: { email: "Email is required" },
          }),
        };
      }

      // Update the login session with the email for subsequent screens
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (loginSession) {
        await ctx.env.data.loginSessions.update(client.tenant.id, state, {
          authParams: {
            ...loginSession.authParams,
            username: email,
          },
        });
      }

      await requestPasswordReset(ctx, client, email, state);

      return {
        screen: await forgotPasswordSentScreen(context),
      };
    },
  },
};
