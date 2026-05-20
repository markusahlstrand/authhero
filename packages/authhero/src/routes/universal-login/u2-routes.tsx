/**
 * U2 Routes - Universal login with SSR + hydration + client-side navigation
 *
 * These routes serve HTML pages with server-side rendered authhero-widget
 * that hydrates on the client for interactivity and client-side navigation.
 *
 * Routes:
 * - GET /u2/login/identifier - Identifier screen (first screen of login flow)
 * - GET /u2/login/email-otp-challenge - Email OTP code verification
 * - GET /u2/login/sms-otp-challenge - SMS OTP code verification
 * - GET /u2/enter-password - Password authentication
 * - GET /u2/signup - New user registration
 * - GET /u2/reset-password/request - Password reset request
 * - GET /u2/reset-password - Set new password
 * - GET /u2/impersonate - User impersonation
 *
 * Each route:
 * 1. Fetches screen data server-side
 * 2. Server-side renders the widget with declarative shadow DOM
 * 3. Hydrates on client for interactivity
 * 4. Supports client-side navigation between screens
 */

import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Bindings, Variables } from "../../types";
import { initJSXRoute } from "./common";
import {
  getScreen,
  getScreenDefinition,
  listScreenIds,
} from "./screens/registry";
import type { ScreenContext } from "./screens/types";
import { HTTPException } from "hono/http-exception";
import { LogTypes } from "@authhero/adapter-interfaces";
import { logMessage } from "../../helpers/logging";
import { sanitizeUrl } from "./sanitization-utils";
import type { PromptScreen, CustomText } from "@authhero/adapter-interfaces";
import {
  derivePageLogoPlacement,
  renderWidgetPageResponse,
  resolveDarkMode,
} from "./u2-widget-page";
import { locales } from "../../i18n";

// Mutable copy of the readonly `locales` tuple — handlers expect string[].
const availableLocales: string[] = [...locales];

/**
 * Mapping from screen IDs (used in routes) to prompt screen IDs (used for custom text)
 * This allows URLs like /u2/login/identifier to fetch custom text for "login-id"
 */
const SCREEN_TO_PROMPT_MAP: Record<string, PromptScreen> = {
  identifier: "login-id",
  login: "login", // Combined identifier + password screen
  "enter-password": "login-password",
  "email-otp-challenge": "email-otp-challenge",
  "sms-otp-challenge": "email-otp-challenge", // SMS shares email-otp-challenge prompt
  signup: "signup",
  "forgot-password": "reset-password",
  "reset-password": "reset-password",
  "reset-password-code": "reset-password",
  impersonate: "login",
  "pre-signup": "signup-id",
  "pre-signup-sent": "signup",
  consent: "consent",
  "login-passwordless-identifier": "login-passwordless",
  mfa: "mfa",
  "mfa-otp": "mfa-otp",
  "mfa-phone-challenge": "mfa-phone",
  "mfa-totp-enrollment": "mfa-otp",
  "mfa-totp-challenge": "mfa-otp",
  "mfa-email": "mfa-email",
  "mfa-push": "mfa-push",
  "mfa-webauthn": "mfa-webauthn",
  "passkey-enrollment-nudge": "passkeys",
  "passkey-enrollment": "passkeys",
  "passkey-challenge": "passkeys",
  "mfa-voice": "mfa-voice",
  "mfa-phone-enrollment": "mfa-phone",
  "mfa-login-options": "mfa-login-options",
  "mfa-recovery-code": "mfa-recovery-code",
  account: "common",
  "account-profile": "common",
  "account-security": "common",
  "account-linked": "common",
  "account-delete": "common",
  "account-passkeys": "common",
  status: "status",
  "device-flow": "device-flow",
  "connect-consent": "consent",
  "connect-tenant-select": "consent",
  "email-verification": "email-verification",
  organizations: "organizations",
  invitation: "invitation",
};

/**
 * Get the prompt screen ID for a given screen ID
 */
function getPromptScreenForScreen(screenId: string): PromptScreen | undefined {
  return SCREEN_TO_PROMPT_MAP[screenId];
}

/**
 * Detect language from ui_locales parameter or Accept-Language header
 * Priority: ui_locales (from OAuth request) > Accept-Language header > "en"
 */
function detectLanguage(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
): string {
  // First, try ui_locales from the OAuth authorization request
  if (uiLocales) {
    // ui_locales can contain multiple locales separated by spaces (e.g., "nb en")
    // Use the first one as the preferred language
    const firstLocale = uiLocales.split(" ")[0];
    if (firstLocale) {
      // Extract just the language code (e.g., "nb" from "nb-NO")
      const langCode = firstLocale.split("-")[0]?.toLowerCase();
      if (langCode) return langCode;
    }
  }

  // Fall back to Accept-Language header
  if (!acceptLanguage) return "en";

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,es;q=0.8")
  const languages = acceptLanguage.split(",").map((lang) => {
    const [code, qValue] = lang.trim().split(";");
    const q = qValue ? parseFloat(qValue.split("=")[1] || "1") : 1;
    // Extract just the language code (e.g., "en" from "en-US")
    const langCode = code?.split("-")[0]?.toLowerCase() || "en";
    return { code: langCode, q };
  });

  // Sort by quality value and return the highest priority language
  languages.sort((a, b) => b.q - a.q);
  return languages[0]?.code || "en";
}

/**
 * Fetch custom text for a screen and language, with fallbacks
 */
async function fetchCustomText(
  ctx: any,
  tenantId: string,
  screenId: string,
  language: string,
): Promise<CustomText | undefined> {
  const promptScreen = getPromptScreenForScreen(screenId);
  if (!promptScreen) return undefined;

  try {
    // Try to get custom text for the specific prompt and language
    let customText = await ctx.env.data.customText.get(
      tenantId,
      promptScreen,
      language,
    );

    // If not found and language has a region (e.g., "en-US"), try base language
    if (!customText && language.includes("-")) {
      const baseLanguage = language.split("-")[0];
      customText = await ctx.env.data.customText.get(
        tenantId,
        promptScreen,
        baseLanguage!,
      );
    }

    // If still not found, try "common" prompts for shared texts
    if (!customText) {
      const commonText = await ctx.env.data.customText.get(
        tenantId,
        "common",
        language,
      );
      if (commonText) {
        customText = commonText;
      }
    }

    return customText || undefined;
  } catch (error) {
    // Custom text adapter may not exist - continue without custom text
    return undefined;
  }
}

/**
 * Create a route handler for a specific screen with SSR + hydration
 */
function createScreenRouteHandler(screenId: string) {
  return async (ctx: any) => {
    const { state, error, error_description, ui_locales } =
      ctx.req.valid("query");

    let theme, branding, client, loginSession;
    try {
      const initResult = await initJSXRoute(ctx, state, true);
      theme = initResult.theme;
      branding = initResult.branding;
      client = initResult.client;
      loginSession = initResult.loginSession;
    } catch (err) {
      console.error(`[u2/${screenId}] Failed to initialize route:`, err);
      throw err;
    }

    // If the user changed language via the picker, persist it to the login session
    // so subsequent screens and emails use the new language
    if (ui_locales && ui_locales !== loginSession.authParams?.ui_locales) {
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        {
          authParams: {
            ...loginSession.authParams,
            ui_locales,
          },
        },
      );
      if (loginSession.authParams) {
        loginSession.authParams.ui_locales = ui_locales;
      }
    }

    // Get custom template if available (gracefully handle missing method/table)
    let customTemplate: { body: string } | null = null;
    try {
      customTemplate = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );
    } catch {
      // Method or table may not exist in older adapters - continue without custom template
    }

    // Detect language: URL ui_locales (picker) > session ui_locales (OAuth) > Accept-Language > "en"
    const acceptLanguage = ctx.req.header("Accept-Language");
    const language = detectLanguage(
      ui_locales || loginSession.authParams?.ui_locales,
      acceptLanguage,
    );

    // Fetch custom text for this screen and language
    const promptScreen = getPromptScreenForScreen(screenId);
    const customText = await fetchCustomText(
      ctx,
      ctx.var.tenant_id,
      screenId,
      language,
    );

    // Build error messages if present from query params
    const errorMessages: Array<{
      text: string;
      type: "error" | "info" | "success" | "warning";
    }> = [];
    if (error_description) {
      errorMessages.push({ text: error_description, type: "error" });
    } else if (error) {
      // Fallback to error code if no description provided
      errorMessages.push({ text: error, type: "error" });
    }

    // Build screen context for SSR
    // Use client.connections which is already ordered per the client's configuration
    // Determine route prefix based on client metadata
    const routePrefix =
      client.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";

    // Build screen-specific data
    const screenData: Record<string, unknown> = {
      email: loginSession.authParams.username,
    };

    // For mfa-phone-challenge screen, load the phone number from the MFA enrollment
    if (screenId === "mfa-phone-challenge" && loginSession) {
      const stateData = loginSession.state_data
        ? JSON.parse(loginSession.state_data)
        : {};
      if (stateData.authenticationMethodId) {
        const enrollment = await ctx.env.data.authenticationMethods.get(
          client.tenant.id,
          stateData.authenticationMethodId,
        );
        if (enrollment?.phone_number) {
          screenData.phone = enrollment.phone_number;
        }
      } else if (loginSession.user_id) {
        const enrollments = await ctx.env.data.authenticationMethods.list(
          client.tenant.id,
          loginSession.user_id,
        );
        const phoneEnrollment = enrollments.find((e) => e.type === "phone");
        if (phoneEnrollment?.phone_number) {
          screenData.phone = phoneEnrollment.phone_number;
        }
      }
    }

    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: client.connections,
      state,
      prefill: {
        username: loginSession.authParams.username,
        email: loginSession.authParams.username,
      },
      data: screenData,
      customText,
      language,
      promptScreen,
      routePrefix,
      messages: errorMessages.length > 0 ? errorMessages : undefined,
    };

    // Fetch screen data for SSR
    const screenResult = getScreen(screenId, screenContext);

    if (!screenResult) {
      throw new HTTPException(404, {
        message: `Screen not found: ${screenId}`,
      });
    }

    // Handle both sync and async screen factories
    let result;
    try {
      result = await screenResult;
    } catch (err) {
      console.error(`[u2/${screenId}] Screen handler error:`, err);
      console.error(`[u2/${screenId}] Context:`, {
        tenant_id: client.tenant?.id,
        client_id: client.client_id,
        client_name: client.name,
        state,
      });
      throw err;
    }

    // Override action URL to use the screen-api endpoint
    // The screen handlers return /u/widget/:screenId but we want /u2/screen/:screenId
    const screen = {
      ...result.screen,
      action: `/u2/screen/${screenId}?state=${encodeURIComponent(state)}`,
      // Update links to use u2 routes
      links: result.screen.links?.map((link) => ({
        ...link,
        href: link.href
          .replace("/u/widget/", "/u2/")
          .replace("/u2/signup", "/u2/signup")
          .replace("/u/signup", "/u2/signup")
          .replace("/u/enter-", "/u2/enter-"),
      })),
    };

    const authParams = {
      client_id: loginSession.authParams.client_id,
      ...(loginSession.authParams.redirect_uri && {
        redirect_uri: loginSession.authParams.redirect_uri,
      }),
      ...(loginSession.authParams.scope && {
        scope: loginSession.authParams.scope,
      }),
      ...(loginSession.authParams.audience && {
        audience: loginSession.authParams.audience,
      }),
      ...(loginSession.authParams.nonce && {
        nonce: loginSession.authParams.nonce,
      }),
      ...(loginSession.authParams.response_type && {
        response_type: loginSession.authParams.response_type,
      }),
    };

    // Serialize data for widget attributes (using the modified screen with correct action URL)
    const screenJson = JSON.stringify(screen);
    const brandingJson = result.branding
      ? JSON.stringify(result.branding)
      : undefined;
    const authParamsJson = JSON.stringify(authParams);
    // When page-level placement suppresses the widget's own logo we feed the
    // SSR renderer a theme variant with `widget.logo_position = "none"`.
    const { logoPosition: pageLogoPosition, theme: themeForWidget } =
      derivePageLogoPlacement(theme);
    const themeJson = themeForWidget
      ? JSON.stringify(themeForWidget)
      : undefined;

    const darkMode = resolveDarkMode(ctx, branding);

    return renderWidgetPageResponse(ctx, {
      screenId,
      screenJson,
      brandingJson,
      themeJson,
      state,
      authParamsJson,
      branding,
      theme,
      clientName: client.name || "AuthHero",
      poweredByLogo: ctx.env.poweredByLogo,
      language,
      availableLanguages: availableLocales,
      termsAndConditionsUrl: sanitizeUrl(
        client.client_metadata?.termsAndConditionsUrl,
      ),
      darkMode,
      logoPosition: pageLogoPosition,
      extraScript: result.extraScript,
      customTemplateBody: customTemplate?.body,
    });
  };
}

/**
 * Common query schema for all screen routes
 */
const screenQuerySchema = z.object({
  state: z.string().openapi({
    description: "The login session state",
  }),
  error: z.string().optional().openapi({
    description: "Error code from failed authentication",
  }),
  error_description: z.string().optional().openapi({
    description: "Human-readable error description",
  }),
  ui_locales: z.string().optional().openapi({
    description: "Language override from the language picker (e.g. 'en', 'sv')",
  }),
});

/**
 * Create GET route definition
 */
function createScreenRoute(
  _screenId: string,
  path: string,
  description: string,
) {
  return createRoute({
    tags: ["u2"],
    method: "get" as const,
    path,
    request: {
      query: screenQuerySchema,
    },
    responses: {
      200: {
        description,
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
      },
    },
  });
}

/**
 * Create POST route definition for no-JS form submissions
 */
function createScreenPostRoute(
  _screenId: string,
  path: string,
  description: string,
) {
  return createRoute({
    tags: ["u2"],
    method: "post" as const,
    path,
    request: {
      query: screenQuerySchema,
      body: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: z.record(z.string(), z.string()),
          },
        },
      },
    },
    responses: {
      200: {
        description,
        content: {
          "text/html": {
            schema: z.string(),
          },
        },
      },
      302: {
        description: "Redirect to next screen or external URL",
      },
    },
  });
}

/**
 * Create a POST handler for no-JS form submissions
 * Processes form data, calls the screen's POST handler, and returns full HTML page
 */
function createScreenPostHandler(screenId: string) {
  return async (ctx: any) => {
    const { state, ui_locales } = ctx.req.valid("query");

    // Parse form data
    const formData = await ctx.req.parseBody();
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(formData)) {
      data[key] = value;
    }

    const { theme, branding, client, loginSession } = await initJSXRoute(
      ctx,
      state,
      true,
    );

    // If the user changed language via the picker, persist it to the login session
    if (ui_locales && ui_locales !== loginSession.authParams?.ui_locales) {
      await ctx.env.data.loginSessions.update(
        client.tenant.id,
        loginSession.id,
        {
          authParams: {
            ...loginSession.authParams,
            ui_locales,
          },
        },
      );
      if (loginSession.authParams) {
        loginSession.authParams.ui_locales = ui_locales;
      }
    }

    // Detect language: URL ui_locales (picker) > session ui_locales (OAuth) > Accept-Language > "en"
    const acceptLanguage = ctx.req.header("Accept-Language");
    const language = detectLanguage(
      ui_locales || loginSession.authParams?.ui_locales,
      acceptLanguage,
    );

    // Fetch custom text for this screen and language
    const promptScreen = getPromptScreenForScreen(screenId);
    const customText = await fetchCustomText(
      ctx,
      ctx.var.tenant_id,
      screenId,
      language,
    );

    // Build screen context
    // Use client.connections which is already ordered per the client's configuration
    // Determine route prefix based on client metadata
    const routePrefix =
      client.client_metadata?.universal_login_version === "2" ? "/u2" : "/u";
    const screenContext: ScreenContext = {
      ctx,
      tenant: client.tenant,
      client,
      branding: branding ?? undefined,
      connections: client.connections,
      state,
      prefill: {
        username: loginSession.authParams.username,
        email: loginSession.authParams.username,
      },
      data: {
        email: loginSession.authParams.username,
      },
      customText,
      language,
      promptScreen,
      routePrefix,
    };

    // Get screen definition and call POST handler
    const definition = getScreenDefinition(screenId);
    if (!definition?.handler.post) {
      throw new HTTPException(400, {
        message: `Screen ${screenId} does not support POST submissions`,
      });
    }

    const result = await definition.handler.post(screenContext, data);

    // If redirect to external URL, do actual redirect with cookies
    if ("redirect" in result) {
      const headers = new Headers();
      headers.set("Location", result.redirect);
      // Add Set-Cookie headers if present
      if (result.cookies && result.cookies.length > 0) {
        for (const cookie of result.cookies) {
          headers.append("Set-Cookie", cookie);
        }
      }
      return new Response(null, {
        status: 302,
        headers,
      });
    }

    // If handler returned a direct Response (e.g., web_message mode), pass it through
    if ("response" in result) {
      return result.response;
    }

    // Otherwise, render the next/current screen as full HTML page
    const screenResult = result.screen;

    // Get custom template if available
    let customTemplate: { body: string } | null = null;
    try {
      customTemplate = await ctx.env.data.universalLoginTemplates.get(
        ctx.var.tenant_id,
      );
    } catch {
      // Method or table may not exist
    }

    const authParams = {
      client_id: loginSession.authParams.client_id,
      ...(loginSession.authParams.redirect_uri && {
        redirect_uri: loginSession.authParams.redirect_uri,
      }),
      ...(loginSession.authParams.scope && {
        scope: loginSession.authParams.scope,
      }),
      ...(loginSession.authParams.audience && {
        audience: loginSession.authParams.audience,
      }),
      ...(loginSession.authParams.nonce && {
        nonce: loginSession.authParams.nonce,
      }),
      ...(loginSession.authParams.response_type && {
        response_type: loginSession.authParams.response_type,
      }),
    };

    // Serialize screen data
    const screenJson = JSON.stringify(screenResult.screen);
    const brandingJson = screenResult.branding
      ? JSON.stringify(screenResult.branding)
      : undefined;
    const authParamsJson = JSON.stringify(authParams);
    // Suppress the widget's internal logo when page-level placement owns it.
    const { logoPosition: pageLogoPosition, theme: themeForWidget } =
      derivePageLogoPlacement(theme);
    const themeJson = themeForWidget
      ? JSON.stringify(themeForWidget)
      : undefined;
    // Get screen name for data-screen attribute (falls back to original screenId if not set)
    const resultScreenId = screenResult.screen.name || screenId;

    const darkMode = resolveDarkMode(ctx, branding);

    return renderWidgetPageResponse(ctx, {
      screenId: resultScreenId,
      screenJson,
      brandingJson,
      themeJson,
      state,
      authParamsJson,
      branding,
      theme,
      clientName: client.name || "AuthHero",
      poweredByLogo: ctx.env.poweredByLogo,
      language,
      availableLanguages: availableLocales,
      termsAndConditionsUrl: sanitizeUrl(
        client.client_metadata?.termsAndConditionsUrl,
      ),
      darkMode,
      logoPosition: pageLogoPosition,
      extraScript: screenResult.extraScript,
      customTemplateBody: customTemplate?.body,
    });
  };
}

export const u2Routes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>()
  // --------------------------------
  // GET /u2/login - Combined identifier + password screen (identifier + password flow)
  // --------------------------------
  .openapi(
    createScreenRoute(
      "login",
      "/login",
      "Login screen - combined email, password, and social login",
    ),
    createScreenRouteHandler("login"),
  )
  // --------------------------------
  // GET /u2/login/identifier - First screen of login flow
  // --------------------------------
  .openapi(
    createScreenRoute(
      "identifier",
      "/login/identifier",
      "Identifier screen - collects email/username",
    ),
    createScreenRouteHandler("identifier"),
  )
  // --------------------------------
  // GET /u2/login/login-passwordless-identifier - Passwordless identifier
  // --------------------------------
  .openapi(
    createScreenRoute(
      "login-passwordless-identifier",
      "/login/login-passwordless-identifier",
      "Login passwordless identifier - collects email/phone for code login",
    ),
    createScreenRouteHandler("login-passwordless-identifier"),
  )
  // --------------------------------
  // GET /u2/login/email-otp-challenge - Email OTP code verification
  // --------------------------------
  .openapi(
    createScreenRoute(
      "email-otp-challenge",
      "/login/email-otp-challenge",
      "Email OTP challenge screen - email code verification",
    ),
    createScreenRouteHandler("email-otp-challenge"),
  )
  // --------------------------------
  // GET /u2/login/sms-otp-challenge - SMS OTP code verification
  // --------------------------------
  .openapi(
    createScreenRoute(
      "sms-otp-challenge",
      "/login/sms-otp-challenge",
      "SMS OTP challenge screen - SMS code verification",
    ),
    createScreenRouteHandler("sms-otp-challenge"),
  )
  // --------------------------------
  // GET /u2/enter-password - Password authentication
  // --------------------------------
  .openapi(
    createScreenRoute(
      "enter-password",
      "/enter-password",
      "Enter password screen",
    ),
    createScreenRouteHandler("enter-password"),
  )
  // --------------------------------
  // GET /u2/signup - New user registration
  // --------------------------------
  .openapi(
    createScreenRoute(
      "signup",
      "/signup",
      "Signup screen - new user registration",
    ),
    createScreenRouteHandler("signup"),
  )
  // --------------------------------
  // GET /u2/reset-password/request - Password reset request
  // --------------------------------
  .openapi(
    createScreenRoute(
      "forgot-password",
      "/reset-password/request",
      "Forgot password screen",
    ),
    createScreenRouteHandler("forgot-password"),
  )
  // --------------------------------
  // GET /u2/reset-password - Set new password
  // --------------------------------
  .openapi(
    createScreenRoute(
      "reset-password",
      "/reset-password",
      "Reset password screen",
    ),
    createScreenRouteHandler("reset-password"),
  )
  // --------------------------------
  // GET /u2/reset-password/code - Enter reset code + new password
  // --------------------------------
  .openapi(
    createScreenRoute(
      "reset-password-code",
      "/reset-password/code",
      "Reset password code entry screen",
    ),
    createScreenRouteHandler("reset-password-code"),
  )
  // --------------------------------
  // GET /u2/impersonate - User impersonation
  // --------------------------------
  .openapi(
    createScreenRoute(
      "impersonate",
      "/impersonate",
      "Impersonate screen - allows users with permission to impersonate other users",
    ),
    createScreenRouteHandler("impersonate"),
  )
  // --------------------------------
  // POST handlers for no-JS form submissions
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "login",
      "/login",
      "Process login form submission (no-JS fallback)",
    ),
    createScreenPostHandler("login"),
  )
  .openapi(
    createScreenPostRoute(
      "identifier",
      "/login/identifier",
      "Process identifier form submission (no-JS fallback)",
    ),
    createScreenPostHandler("identifier"),
  )
  .openapi(
    createScreenPostRoute(
      "login-passwordless-identifier",
      "/login/login-passwordless-identifier",
      "Process login-passwordless-identifier form submission (no-JS fallback)",
    ),
    createScreenPostHandler("login-passwordless-identifier"),
  )
  .openapi(
    createScreenPostRoute(
      "email-otp-challenge",
      "/login/email-otp-challenge",
      "Process email-otp-challenge form submission (no-JS fallback)",
    ),
    createScreenPostHandler("email-otp-challenge"),
  )
  .openapi(
    createScreenPostRoute(
      "sms-otp-challenge",
      "/login/sms-otp-challenge",
      "Process sms-otp-challenge form submission (no-JS fallback)",
    ),
    createScreenPostHandler("sms-otp-challenge"),
  )
  .openapi(
    createScreenPostRoute(
      "enter-password",
      "/enter-password",
      "Process enter-password form submission (no-JS fallback)",
    ),
    createScreenPostHandler("enter-password"),
  )
  .openapi(
    createScreenPostRoute(
      "signup",
      "/signup",
      "Process signup form submission (no-JS fallback)",
    ),
    createScreenPostHandler("signup"),
  )
  .openapi(
    createScreenPostRoute(
      "forgot-password",
      "/reset-password/request",
      "Process forgot-password form submission (no-JS fallback)",
    ),
    createScreenPostHandler("forgot-password"),
  )
  .openapi(
    createScreenPostRoute(
      "reset-password",
      "/reset-password",
      "Process reset-password form submission (no-JS fallback)",
    ),
    createScreenPostHandler("reset-password"),
  )
  .openapi(
    createScreenPostRoute(
      "reset-password-code",
      "/reset-password/code",
      "Process reset-password-code form submission (no-JS fallback)",
    ),
    createScreenPostHandler("reset-password-code"),
  )
  .openapi(
    createScreenPostRoute(
      "impersonate",
      "/impersonate",
      "Process impersonate form submission (no-JS fallback)",
    ),
    createScreenPostHandler("impersonate"),
  )
  // --------------------------------
  // GET /u2/mfa/phone-enrollment - MFA phone enrollment
  // --------------------------------
  .openapi(
    createScreenRoute(
      "mfa-phone-enrollment",
      "/mfa/phone-enrollment",
      "MFA phone enrollment screen - enter phone number for SMS MFA",
    ),
    createScreenRouteHandler("mfa-phone-enrollment"),
  )
  // --------------------------------
  // POST /u2/mfa/phone-enrollment
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "mfa-phone-enrollment",
      "/mfa/phone-enrollment",
      "Process MFA phone enrollment form submission",
    ),
    createScreenPostHandler("mfa-phone-enrollment"),
  )
  // --------------------------------
  // GET /u2/mfa/phone-challenge - MFA phone challenge
  // --------------------------------
  .openapi(
    createScreenRoute(
      "mfa-phone-challenge",
      "/mfa/phone-challenge",
      "MFA phone challenge screen - enter verification code",
    ),
    createScreenRouteHandler("mfa-phone-challenge"),
  )
  // --------------------------------
  // POST /u2/mfa/phone-challenge
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "mfa-phone-challenge",
      "/mfa/phone-challenge",
      "Process MFA phone challenge form submission",
    ),
    createScreenPostHandler("mfa-phone-challenge"),
  )
  // --------------------------------
  // GET /u2/mfa/totp-enrollment - MFA TOTP enrollment
  // --------------------------------
  .openapi(
    createScreenRoute(
      "mfa-totp-enrollment",
      "/mfa/totp-enrollment",
      "MFA TOTP enrollment screen - set up authenticator app",
    ),
    createScreenRouteHandler("mfa-totp-enrollment"),
  )
  // --------------------------------
  // POST /u2/mfa/totp-enrollment
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "mfa-totp-enrollment",
      "/mfa/totp-enrollment",
      "Process MFA TOTP enrollment form submission",
    ),
    createScreenPostHandler("mfa-totp-enrollment"),
  )
  // --------------------------------
  // GET /u2/mfa/totp-challenge - MFA TOTP challenge
  // --------------------------------
  .openapi(
    createScreenRoute(
      "mfa-totp-challenge",
      "/mfa/totp-challenge",
      "MFA TOTP challenge screen - enter authenticator app code",
    ),
    createScreenRouteHandler("mfa-totp-challenge"),
  )
  // --------------------------------
  // POST /u2/mfa/totp-challenge
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "mfa-totp-challenge",
      "/mfa/totp-challenge",
      "Process MFA TOTP challenge form submission",
    ),
    createScreenPostHandler("mfa-totp-challenge"),
  )
  // --------------------------------
  // GET /u2/mfa/login-options - MFA factor selection
  // --------------------------------
  .openapi(
    createScreenRoute(
      "mfa-login-options",
      "/mfa/login-options",
      "MFA factor selection screen - choose verification method",
    ),
    createScreenRouteHandler("mfa-login-options"),
  )
  // --------------------------------
  // POST /u2/mfa/login-options
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "mfa-login-options",
      "/mfa/login-options",
      "Process MFA factor selection",
    ),
    createScreenPostHandler("mfa-login-options"),
  )
  // --------------------------------
  // GET /u2/passkey/enrollment-nudge - Passkey enrollment nudge
  // --------------------------------
  .openapi(
    createScreenRoute(
      "passkey-enrollment-nudge",
      "/passkey/enrollment-nudge",
      "Passkey enrollment nudge - asks user to set up a passkey",
    ),
    createScreenRouteHandler("passkey-enrollment-nudge"),
  )
  // --------------------------------
  // POST /u2/passkey/enrollment-nudge
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "passkey-enrollment-nudge",
      "/passkey/enrollment-nudge",
      "Process passkey enrollment nudge response",
    ),
    createScreenPostHandler("passkey-enrollment-nudge"),
  )
  // --------------------------------
  // GET /u2/passkey/enrollment - Passkey registration ceremony
  // --------------------------------
  .openapi(
    createScreenRoute(
      "passkey-enrollment",
      "/passkey/enrollment",
      "Passkey enrollment screen - WebAuthn registration ceremony",
    ),
    createScreenRouteHandler("passkey-enrollment"),
  )
  // --------------------------------
  // POST /u2/passkey/enrollment
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "passkey-enrollment",
      "/passkey/enrollment",
      "Process passkey enrollment form submission",
    ),
    createScreenPostHandler("passkey-enrollment"),
  )
  // --------------------------------
  // GET /u2/passkey/challenge - Passkey authentication challenge
  // --------------------------------
  .openapi(
    createScreenRoute(
      "passkey-challenge",
      "/passkey/challenge",
      "Passkey authentication challenge - sign in with a passkey",
    ),
    createScreenRouteHandler("passkey-challenge"),
  )
  // --------------------------------
  // POST /u2/passkey/challenge
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "passkey-challenge",
      "/passkey/challenge",
      "Process passkey authentication response",
    ),
    createScreenPostHandler("passkey-challenge"),
  )
  // --------------------------------
  // GET /u2/account - Account management hub
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account",
      "/account",
      "Account management hub - view profile and settings",
    ),
    createScreenRouteHandler("account"),
  )
  // --------------------------------
  // GET /u2/account/profile - Edit profile
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-profile",
      "/account/profile",
      "Edit personal information",
    ),
    createScreenRouteHandler("account-profile"),
  )
  // --------------------------------
  // POST /u2/account/profile
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-profile",
      "/account/profile",
      "Process profile update form submission",
    ),
    createScreenPostHandler("account-profile"),
  )
  // --------------------------------
  // GET /u2/account/security - MFA management
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-security",
      "/account/security",
      "Security settings - manage two-factor authentication",
    ),
    createScreenRouteHandler("account-security"),
  )
  // --------------------------------
  // POST /u2/account/security
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-security",
      "/account/security",
      "Process security settings form submission",
    ),
    createScreenPostHandler("account-security"),
  )
  // --------------------------------
  // GET /u2/account/security/totp-enrollment - TOTP enrollment from account
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-mfa-totp-enrollment",
      "/account/security/totp-enrollment",
      "Set up authenticator app MFA from account settings",
    ),
    createScreenRouteHandler("account-mfa-totp-enrollment"),
  )
  // --------------------------------
  // POST /u2/account/security/totp-enrollment
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-mfa-totp-enrollment",
      "/account/security/totp-enrollment",
      "Process authenticator app enrollment form submission",
    ),
    createScreenPostHandler("account-mfa-totp-enrollment"),
  )
  // --------------------------------
  // GET /u2/account/security/phone-enrollment - Phone enrollment from account
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-mfa-phone-enrollment",
      "/account/security/phone-enrollment",
      "Set up SMS MFA from account settings",
    ),
    createScreenRouteHandler("account-mfa-phone-enrollment"),
  )
  // --------------------------------
  // POST /u2/account/security/phone-enrollment
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-mfa-phone-enrollment",
      "/account/security/phone-enrollment",
      "Process phone enrollment form submission",
    ),
    createScreenPostHandler("account-mfa-phone-enrollment"),
  )
  // --------------------------------
  // GET /u2/account/linked - Linked accounts
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-linked",
      "/account/linked",
      "Linked accounts management",
    ),
    createScreenRouteHandler("account-linked"),
  )
  // --------------------------------
  // POST /u2/account/linked
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-linked",
      "/account/linked",
      "Process linked accounts form submission",
    ),
    createScreenPostHandler("account-linked"),
  )
  // --------------------------------
  // GET /u2/account/delete - Delete account
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-delete",
      "/account/delete",
      "Delete account confirmation",
    ),
    createScreenRouteHandler("account-delete"),
  )
  // --------------------------------
  // POST /u2/account/delete
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-delete",
      "/account/delete",
      "Process account deletion",
    ),
    createScreenPostHandler("account-delete"),
  )
  // --------------------------------
  // GET /u2/account/passkeys - Passkey management
  // --------------------------------
  .openapi(
    createScreenRoute(
      "account-passkeys",
      "/account/passkeys",
      "Passkey management - view, add, rename, remove passkeys",
    ),
    createScreenRouteHandler("account-passkeys"),
  )
  // --------------------------------
  // POST /u2/account/passkeys
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "account-passkeys",
      "/account/passkeys",
      "Process passkey management form submission",
    ),
    createScreenPostHandler("account-passkeys"),
  )
  // --------------------------------
  // GET /u2/connect/start - Consent-mediated DCR Initial Access Token issuance
  // --------------------------------
  .openapi(
    createScreenRoute(
      "connect-consent",
      "/connect/start",
      "Connect consent screen - mints an IAT bound to user consent",
    ),
    createScreenRouteHandler("connect-consent"),
  )
  // --------------------------------
  // POST /u2/connect/start
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "connect-consent",
      "/connect/start",
      "Process connect-consent confirmation and mint IAT",
    ),
    createScreenPostHandler("connect-consent"),
  )
  // --------------------------------
  // GET /u2/connect/select-tenant - Multi-tenancy control-plane workspace picker
  // --------------------------------
  .openapi(
    createScreenRoute(
      "connect-tenant-select",
      "/connect/select-tenant",
      "Pick the child tenant the consent-mediated IAT will be minted on",
    ),
    createScreenRouteHandler("connect-tenant-select"),
  )
  // --------------------------------
  // GET /u2/try-connection-result - Diagnostic result page for /try
  // --------------------------------
  .openapi(
    createScreenRoute(
      "try-connection-result",
      "/try-connection-result",
      "Renders the outcome of a connection test (Try Connection)",
    ),
    createScreenRouteHandler("try-connection-result"),
  )
  // --------------------------------
  // POST /u2/connect/select-tenant
  // --------------------------------
  .openapi(
    createScreenPostRoute(
      "connect-tenant-select",
      "/connect/select-tenant",
      "Persist the chosen tenant id and continue to consent",
    ),
    createScreenPostHandler("connect-tenant-select"),
  )
  // --------------------------------
  // GET /u2/guardian/enroll - Guardian enrollment ticket redemption
  // --------------------------------
  .openapi(
    createRoute({
      tags: ["u2"],
      method: "get",
      path: "/guardian/enroll",
      request: {
        query: z.object({
          ticket: z.string(),
        }),
      },
      responses: {
        302: {
          description: "Redirect to MFA enrollment screen",
        },
        403: {
          description: "Invalid or expired ticket",
          content: {
            "text/html": {
              schema: z.string(),
            },
          },
        },
      },
    }),
    async (ctx) => {
      const { ticket } = ctx.req.valid("query");
      const tenantId = ctx.var.tenant_id;

      // Validate the ticket
      const code = await ctx.env.data.codes.get(tenantId, ticket, "ticket");
      if (!code) {
        logMessage(ctx, tenantId, {
          type: LogTypes.MFA_ENROLLMENT_FAILED,
          description: "Enrollment ticket not found",
        });
        throw new HTTPException(403, {
          message: "Enrollment ticket not found",
        });
      }

      if (code.used_at) {
        logMessage(ctx, tenantId, {
          type: LogTypes.MFA_ENROLLMENT_FAILED,
          description: "Enrollment ticket has already been used",
          userId: code.user_id,
        });
        throw new HTTPException(403, {
          message: "Enrollment ticket has already been used",
        });
      }

      if (new Date(code.expires_at) < new Date()) {
        logMessage(ctx, tenantId, {
          type: LogTypes.MFA_ENROLLMENT_FAILED,
          description: "Enrollment ticket has expired",
          userId: code.user_id,
        });
        throw new HTTPException(403, {
          message: "Enrollment ticket has expired",
        });
      }

      // Atomically consume the ticket (prevents race conditions)
      const consumed = await ctx.env.data.codes.consume(tenantId, ticket);
      if (!consumed) {
        logMessage(ctx, tenantId, {
          type: LogTypes.MFA_ENROLLMENT_FAILED,
          description: "Enrollment ticket has already been used",
          userId: code.user_id,
        });
        throw new HTTPException(403, {
          message: "Enrollment ticket has already been used",
        });
      }

      // Get the login session
      const loginSession = await ctx.env.data.loginSessions.get(
        tenantId,
        code.login_id,
      );
      if (!loginSession || !loginSession.user_id) {
        logMessage(ctx, tenantId, {
          type: LogTypes.MFA_ENROLLMENT_FAILED,
          description: "Invalid enrollment session",
          userId: code.user_id,
        });
        throw new HTTPException(403, {
          message: "Invalid enrollment session",
        });
      }

      // Determine which MFA factor to enroll based on tenant config
      const tenant = await ctx.env.data.tenants.get(tenantId);
      const factors = tenant?.mfa?.factors;

      const state = encodeURIComponent(loginSession.id);

      const hasOtp = factors?.otp === true;
      const hasSms = factors?.sms === true;
      const hasWebauthn =
        factors?.webauthn_roaming === true ||
        factors?.webauthn_platform === true;

      const factorCount =
        (hasOtp ? 1 : 0) + (hasSms ? 1 : 0) + (hasWebauthn ? 1 : 0);

      if (factorCount > 1) {
        // Multiple factors enabled - let user choose
        return ctx.redirect(`/u2/mfa/login-options?state=${state}`);
      } else if (hasOtp) {
        return ctx.redirect(`/u2/mfa/totp-enrollment?state=${state}`);
      } else if (hasSms) {
        return ctx.redirect(`/u2/mfa/phone-enrollment?state=${state}`);
      } else if (hasWebauthn) {
        return ctx.redirect(`/u2/passkey/enrollment?state=${state}`);
      }

      throw new HTTPException(400, {
        message: "No MFA factors enabled for this tenant",
      });
    },
  );

// OpenAPI documentation
u2Routes.doc("/spec", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "U2 Universal Login (Client-side Widget)",
    description: `Client-side widget-based universal login. Available built-in screens: ${listScreenIds().join(", ")}`,
  },
});
