/**
 * Signup screen - for new user registration
 *
 * Corresponds to: /u/signup
 */

import type { UiScreen, FormNodeComponent } from "@authhero/adapter-interfaces";
import type { ScreenContext, ScreenResult, ScreenDefinition } from "./types";
import { createTranslation, type Messages } from "../../../i18n";
import { getConnectionIconUrl } from "../../../strategies";
import { getUserByProvider } from "../../../helpers/users";
import {
  getPasswordPolicy,
  validatePasswordPolicy,
  hashPassword,
} from "../../../helpers/password-policy";
import { userIdGenerate } from "../../../utils/user-id";
import { sendValidateEmailAddress } from "../../../emails";
import { loginWithPassword } from "../../../authentication-flows/password";

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
    name: "signup",
    // Action points to HTML endpoint for no-JS fallback
    action: `${baseUrl}/u2/signup?state=${encodeURIComponent(state)}`,
    method: "POST",
    title: m.create_account_title(),
    description: m.create_account_description(),
    components,
    links: [
      {
        id: "login",
        text: m.already_have_account(),
        linkText: m.log_in(),
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
    post: async (context, data) => {
      const { ctx, client, state } = context;
      const email = (data.email as string)?.toLowerCase()?.trim();
      const password = (data.password as string)?.trim();
      const rePassword = (data.re_password as string)?.trim();

      // Initialize i18n for error messages
      const locale = context.language || "en";
      const { m } = createTranslation(locale, context.customText);

      // Validate required fields
      if (!email) {
        return {
          error: "Email is required",
          screen: await signupScreen({
            ...context,
            errors: { email: m.invalid_email() },
          }),
        };
      }

      if (!password) {
        return {
          error: "Password is required",
          screen: await signupScreen({
            ...context,
            prefill: { email },
            errors: { password: m.invalid_password() },
          }),
        };
      }

      if (!rePassword) {
        return {
          error: "Please confirm your password",
          screen: await signupScreen({
            ...context,
            prefill: { email },
            errors: { re_password: m.confirm_password() },
          }),
        };
      }

      // Check passwords match
      if (password !== rePassword) {
        return {
          error: "Passwords don't match",
          screen: await signupScreen({
            ...context,
            prefill: { email },
            errors: { re_password: m.create_account_passwords_didnt_match() },
          }),
        };
      }

      // Find the password connection from the client's connections
      const passwordConnection = client.connections.find(
        (c) => c.strategy === "Username-Password-Authentication",
      );
      const connection =
        passwordConnection?.name || "Username-Password-Authentication";

      // Validate password against connection policy
      const policy = await getPasswordPolicy(
        ctx.env.data,
        client.tenant.id,
        connection,
      );

      try {
        await validatePasswordPolicy(policy, {
          tenantId: client.tenant.id,
          userId: "", // No user yet for signup
          newPassword: password,
          data: ctx.env.data,
        });
      } catch (policyError: unknown) {
        const errorMessage = policyError instanceof Error 
          ? policyError.message 
          : m.create_account_weak_password();

        return {
          error: errorMessage,
          screen: await signupScreen({
            ...context,
            prefill: { email },
            errors: { password: errorMessage },
          }),
        };
      }

      // Check if user already exists
      const existingUser = await getUserByProvider({
        userAdapter: ctx.env.data.users,
        tenant_id: client.tenant.id,
        username: email,
        provider: "auth2",
      });

      if (existingUser) {
        return {
          error: "User already exists",
          screen: await signupScreen({
            ...context,
            prefill: { email },
            errors: { email: m.email_already_taken() },
          }),
        };
      }

      // Get the login session
      const loginSession = await ctx.env.data.loginSessions.get(
        client.tenant.id,
        state,
      );

      if (!loginSession) {
        return {
          error: "Session expired",
          screen: await signupScreen({
            ...context,
            prefill: { email },
            errors: { email: "Session expired. Please try again." },
          }),
        };
      }

      // Update the login session with the username
      loginSession.authParams.username = email;
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        loginSession,
      );

      const user_id = `auth2|${userIdGenerate()}`;

      // Hash password first
      const { hash, algorithm } = await hashPassword(password);

      // Create the new user with password atomically in a single transaction
      const newUser = await ctx.env.data.users.create(client.tenant.id, {
        user_id,
        email,
        email_verified: false,
        provider: "auth2",
        connection,
        is_social: false,
        password: { hash, algorithm },
      });

      // Extract language from ui_locales
      const language = loginSession.authParams?.ui_locales
        ?.split(" ")
        ?.map((locale: string) => locale.split("-")[0])[0];

      // Send verification email - wrapped in try/catch to prevent signup failure
      // if email sending fails. User can always re-request verification later.
      try {
        await sendValidateEmailAddress(ctx, newUser, language);
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        // Continue with signup - email verification can be retried later
      }

      // Try to log in the user
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

        if (result instanceof Response) {
          // Get the redirect URL from the response
          const location = result.headers.get("location");
          // Extract Set-Cookie headers to pass to the caller
          const cookies = result.headers.getSetCookie?.() || [];
          if (location) {
            return { redirect: location, cookies };
          }
        }

        // If we got here, something went wrong but user was created
        // Just return success message about verification email
        return {
          screen: await signupScreen({
            ...context,
            messages: [{ text: m.validate_email_body(), type: "success" }],
          }),
        };
      } catch {
        // Login failed but user was created, show message about verification
        return {
          screen: await signupScreen({
            ...context,
            messages: [{ text: m.validate_email_body(), type: "success" }],
          }),
        };
      }
    },
  },
};
