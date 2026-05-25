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
import { nanoid } from "nanoid";
import { getEnrichedClient } from "../../helpers/client";
import { UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS } from "../../constants";

import { defineRoute } from "../../utils/define-route";
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
  "accept-invitation": "invitation",
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

    // For accept-invitation, surface the org/inviter metadata from state_data
    // so the screen can render them in the title/description.
    if (screenId === "accept-invitation" && loginSession?.state_data) {
      try {
        const stateData = JSON.parse(loginSession.state_data);
        if (stateData.organization_name) {
          screenData.organization_name = stateData.organization_name;
        }
        if (stateData.inviter_name) {
          screenData.inviter_name = stateData.inviter_name;
        }
      } catch {
        // ignore malformed state_data
      }
    }

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
// ============================================================================
// Screen registry + catch-all dispatcher routes
// ============================================================================
// Every URL path served by u2 maps to a screenId consumed by the screen
// handler in ./screens/registry. The path is the externally-visible URL
// contract — linked from authentication flows, emails, etc. — and must
// remain stable. The screenId is internal and only changes the dispatch
// target.
//
// Two enums (one per HTTP method) gate the catch-all `:screen{.+}` routes —
// Zod rejects unknown values with 400. The OpenAPI spec exposes the full
// list of valid screens via the enum, so external consumers can still
// discover what's supported.
//
// Paths are written without a leading slash because Hono's `:screen{.+}`
// capture excludes it; the dispatcher prepends nothing when looking up the
// screenId.

const SCREEN_GET_PATHS = {
  "login": "login",
  "login/identifier": "identifier",
  "login/email-otp-challenge": "email-otp-challenge",
  "login/sms-otp-challenge": "sms-otp-challenge",
  "login/login-passwordless-identifier": "login-passwordless-identifier",
  "signup": "signup",
  "enter-password": "enter-password",
  "reset-password": "reset-password",
  "reset-password/code": "reset-password-code",
  "reset-password/request": "forgot-password",
  "mfa/login-options": "mfa-login-options",
  "mfa/totp-challenge": "mfa-totp-challenge",
  "mfa/totp-enrollment": "mfa-totp-enrollment",
  "mfa/phone-challenge": "mfa-phone-challenge",
  "mfa/phone-enrollment": "mfa-phone-enrollment",
  "passkey/challenge": "passkey-challenge",
  "passkey/enrollment": "passkey-enrollment",
  "passkey/enrollment-nudge": "passkey-enrollment-nudge",
  "impersonate": "impersonate",
  "account": "account",
  "account/profile": "account-profile",
  "account/security": "account-security",
  "account/security/totp-enrollment": "account-mfa-totp-enrollment",
  "account/security/phone-enrollment": "account-mfa-phone-enrollment",
  "account/linked": "account-linked",
  "account/delete": "account-delete",
  "account/passkeys": "account-passkeys",
  "connect/start": "connect-consent",
  "connect/select-tenant": "connect-tenant-select",
  "try-connection-result": "try-connection-result",
} as const;

// Subset that also accepts POST (form submissions). All entries here also
// appear in SCREEN_GET_PATHS — this map just narrows the valid POST values.
const SCREEN_POST_PATHS = {
  "login": "login",
  "login/identifier": "identifier",
  "login/email-otp-challenge": "email-otp-challenge",
  "login/sms-otp-challenge": "sms-otp-challenge",
  "login/login-passwordless-identifier": "login-passwordless-identifier",
  "signup": "signup",
  "enter-password": "enter-password",
  "reset-password": "reset-password",
  "reset-password/code": "reset-password-code",
  "reset-password/request": "forgot-password",
  "mfa/login-options": "mfa-login-options",
  "mfa/totp-challenge": "mfa-totp-challenge",
  "mfa/totp-enrollment": "mfa-totp-enrollment",
  "mfa/phone-challenge": "mfa-phone-challenge",
  "mfa/phone-enrollment": "mfa-phone-enrollment",
  "passkey/challenge": "passkey-challenge",
  "passkey/enrollment": "passkey-enrollment",
  "passkey/enrollment-nudge": "passkey-enrollment-nudge",
  "impersonate": "impersonate",
  "account/profile": "account-profile",
  "account/security": "account-security",
  "account/security/totp-enrollment": "account-mfa-totp-enrollment",
  "account/security/phone-enrollment": "account-mfa-phone-enrollment",
  "account/linked": "account-linked",
  "account/delete": "account-delete",
  "account/passkeys": "account-passkeys",
  "connect/start": "connect-consent",
  "connect/select-tenant": "connect-tenant-select",
} as const;

type GetScreenPath = keyof typeof SCREEN_GET_PATHS;
type PostScreenPath = keyof typeof SCREEN_POST_PATHS;

const getScreenEnum = z.enum(
  Object.keys(SCREEN_GET_PATHS) as [GetScreenPath, ...GetScreenPath[]],
);
const postScreenEnum = z.enum(
  Object.keys(SCREEN_POST_PATHS) as [PostScreenPath, ...PostScreenPath[]],
);

const getScreenRoute = defineRoute({
  route: createRoute({
    tags: ["u2"],
    method: "get",
    path: "/:screen{.+}",
    request: {
      params: z.object({ screen: getScreenEnum }),
      query: screenQuerySchema,
    },
    responses: {
      200: {
        description: "Universal-login screen",
        content: { "text/html": { schema: z.string() } },
      },
      302: { description: "Redirect to next screen" },
      400: { description: "Unknown screen path" },
    },
  }),
  handler: async (ctx) => {
    const { screen } = ctx.req.valid("param");
    return createScreenRouteHandler(SCREEN_GET_PATHS[screen])(ctx);
  },
});

const postScreenRoute = defineRoute({
  route: createRoute({
    tags: ["u2"],
    method: "post",
    path: "/:screen{.+}",
    request: {
      params: z.object({ screen: postScreenEnum }),
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
        description: "Screen HTML",
        content: { "text/html": { schema: z.string() } },
      },
      302: { description: "Redirect to next screen or external URL" },
      400: { description: "Unknown screen path" },
    },
  }),
  handler: async (ctx) => {
    const { screen } = ctx.req.valid("param");
    return createScreenPostHandler(SCREEN_POST_PATHS[screen])(ctx);
  },
});

const getGuardianEnroll = defineRoute({
  route: createRoute({
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
  handler: async (ctx) => {
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
});


// ----------------------------------------------------------------------------
// Special routes: paths with custom logic that don't fit the screen dispatcher.
// Registered before the catch-all `:screen{.+}` so trie matching reaches them.
// ----------------------------------------------------------------------------

const getAcceptInvitation = defineRoute({
  route: createRoute({
    tags: ["u2"],
    method: "get",
    path: "/accept-invitation",
    request: {
      query: z.object({
        invitation: z.string().optional(),
        organization: z.string().optional(),
        state: z.string().optional(),
        error: z.string().optional(),
        error_description: z.string().optional(),
        ui_locales: z.string().optional(),
      }),
    },
    responses: {
      200: {
        description: "Accept invitation screen",
        content: { "text/html": { schema: z.string() } },
      },
      302: { description: "Redirect to bootstrapped session" },
    },
  }),
  handler: async (ctx: any) => {
    const query = ctx.req.valid("query");
    if (query.state) {
      // Reuse the standard screen handler for the rendered form.
      return createScreenRouteHandler("accept-invitation")(ctx);
    }

    if (!query.invitation || !query.organization) {
      throw new HTTPException(400, {
        message: "Missing invitation or organization parameter",
      });
    }

    // We don't know the tenant yet — the invite lookup is per-tenant. The
    // tenant resolution middleware sets ctx.var.tenant_id from the host or
    // header before this handler runs.
    const tenantId = ctx.var.tenant_id;
    const invite = await ctx.env.data.invites.get(tenantId, query.invitation);
    if (
      !invite ||
      invite.organization_id !== query.organization ||
      new Date(invite.expires_at).getTime() < Date.now()
    ) {
      throw new HTTPException(404, {
        message: "Invitation invalid or expired",
      });
    }

    const organization = await ctx.env.data.organizations.get(
      tenantId,
      invite.organization_id,
    );
    if (!organization) {
      throw new HTTPException(404, { message: "Organization not found" });
    }

    const enriched = await getEnrichedClient(ctx.env, invite.client_id);
    const redirectUri = enriched.callbacks?.[0];
    if (!redirectUri) {
      throw new HTTPException(400, {
        message: "Invitation client has no callback URL configured",
      });
    }

    const loginSession = await ctx.env.data.loginSessions.create(tenantId, {
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      csrf_token: nanoid(),
      authorization_url: ctx.req.url,
      authParams: {
        client_id: invite.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid profile email",
        username: invite.invitee?.email,
      },
      state_data: JSON.stringify({
        invitation_id: invite.id,
        organization_id: invite.organization_id,
        organization_name:
          organization.display_name || organization.name || organization.id,
        inviter_name: invite.inviter?.name,
        roles: invite.roles || [],
      }),
    });

    return ctx.redirect(
      `/u2/accept-invitation?state=${encodeURIComponent(loginSession.id)}`,
    );
  },
});

const postAcceptInvitation = defineRoute({
  route: createRoute({
    tags: ["u2"],
    method: "post",
    path: "/accept-invitation",
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
        description: "Process accept-invitation form submission",
        content: { "text/html": { schema: z.string() } },
      },
      302: { description: "Redirect to next screen or external URL" },
    },
  }),
  handler: createScreenPostHandler("accept-invitation"),
});

const getEmailVerificationTicket = defineRoute({
  route: createRoute({
    tags: ["u2"],
    method: "get",
    path: "/tickets/email-verification",
    request: {
      query: z.object({
        ticket: z.string(),
        tenant_id: z.string().optional(),
      }),
    },
    responses: {
      302: { description: "Redirect to result_url" },
      200: {
        description: "Verification complete",
        content: { "text/html": { schema: z.string() } },
      },
    },
  }),
  handler: async (ctx: any) => {
    const { ticket } = ctx.req.valid("query");
    const tenantId = ctx.var.tenant_id;

    const code = await ctx.env.data.codes.get(tenantId, ticket, "ticket");
    if (!code || new Date(code.expires_at).getTime() < Date.now()) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_VERIFICATION_EMAIL,
        description: "Ticket invalid or expired",
      });
      throw new HTTPException(400, { message: "Ticket invalid or expired" });
    }
    if (code.used_at) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_VERIFICATION_EMAIL,
        description: "Ticket already consumed",
        userId: code.user_id || undefined,
      });
      throw new HTTPException(400, { message: "Ticket already consumed" });
    }

    // Validate ticket purpose BEFORE consuming so non-email-verification
    // tickets (e.g. password-change) presented to this endpoint aren't burned.
    let meta: { purpose?: string; result_url?: string } = {};
    try {
      meta = code.state ? JSON.parse(code.state) : {};
    } catch {
      // ignore
    }
    if (meta.purpose !== "email_verification") {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_VERIFICATION_EMAIL,
        description: "Wrong ticket type",
        userId: code.user_id || undefined,
      });
      throw new HTTPException(400, { message: "Wrong ticket type" });
    }
    if (!code.user_id) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_VERIFICATION_EMAIL,
        description: "Ticket has no user",
      });
      throw new HTTPException(400, { message: "Ticket has no user" });
    }

    const consumed = await ctx.env.data.codes.consume(tenantId, ticket);
    if (!consumed) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_VERIFICATION_EMAIL,
        description: "Ticket already consumed",
        userId: code.user_id || undefined,
      });
      throw new HTTPException(400, { message: "Ticket already consumed" });
    }

    await ctx.env.data.users.update(tenantId, code.user_id, {
      email_verified: true,
    });

    await logMessage(ctx, tenantId, {
      type: LogTypes.SUCCESS_VERIFICATION_EMAIL,
      description: "Successful email verification",
      userId: code.user_id,
    });

    if (meta.result_url) {
      return ctx.redirect(meta.result_url);
    }
    return ctx.html(
      "<!doctype html><html><body><p>Email verified.</p></body></html>",
    );
  },
});

const getPasswordChangeTicket = defineRoute({
  route: createRoute({
    tags: ["u2"],
    method: "get",
    path: "/tickets/password-change",
    request: {
      query: z.object({
        ticket: z.string(),
        tenant_id: z.string().optional(),
      }),
    },
    responses: {
      302: { description: "Redirect to reset-password screen" },
    },
  }),
  handler: async (ctx: any) => {
    const { ticket } = ctx.req.valid("query");
    const tenantId = ctx.var.tenant_id;

    const code = await ctx.env.data.codes.get(tenantId, ticket, "ticket");
    if (!code || new Date(code.expires_at).getTime() < Date.now()) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: "Ticket invalid or expired",
      });
      throw new HTTPException(400, { message: "Ticket invalid or expired" });
    }
    if (code.used_at) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: "Ticket already consumed",
        userId: code.user_id || undefined,
      });
      throw new HTTPException(400, { message: "Ticket already consumed" });
    }

    let meta: {
      purpose?: string;
      client_id?: string;
      result_url?: string;
      mark_email_as_verified?: boolean;
    } = {};
    try {
      meta = code.state ? JSON.parse(code.state) : {};
    } catch {
      // ignore
    }
    if (meta.purpose !== "password_change") {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: `Wrong ticket type (purpose=${meta.purpose})`,
        userId: code.user_id || undefined,
      });
      throw new HTTPException(400, { message: "Wrong ticket type" });
    }
    if (!code.user_id) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: "Ticket has no user",
      });
      throw new HTTPException(400, { message: "Ticket has no user" });
    }

    const user = await ctx.env.data.users.get(tenantId, code.user_id);
    if (!user) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: `User not found (user_id=${code.user_id})`,
        userId: code.user_id,
      });
      throw new HTTPException(404, { message: "User not found" });
    }

    let clientId = meta.client_id;
    if (!clientId) {
      const { clients } = await ctx.env.data.clients.list(tenantId);
      clientId = clients[0]?.client_id;
    }
    if (!clientId) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: "No client available for ticket",
        userId: user.user_id,
      });
      throw new HTTPException(400, {
        message: "No client available for ticket",
      });
    }

    const enriched = await getEnrichedClient(ctx.env, clientId);
    const redirectUri = meta.result_url || enriched.callbacks?.[0];
    if (!redirectUri) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: `Ticket client has no callback URL (client_id=${clientId})`,
        userId: user.user_id,
      });
      throw new HTTPException(400, {
        message: "Ticket client has no callback URL",
      });
    }

    // Consume the ticket atomically before any mutations so a failed consume
    // (already-used, race) doesn't leave the user partially updated.
    const consumed = await ctx.env.data.codes.consume(tenantId, ticket);
    if (!consumed) {
      await logMessage(ctx, tenantId, {
        type: LogTypes.FAILED_CHANGE_PASSWORD,
        description: "Ticket already consumed",
        userId: user.user_id,
      });
      throw new HTTPException(400, { message: "Ticket already consumed" });
    }

    if (meta.mark_email_as_verified && !user.email_verified) {
      await ctx.env.data.users.update(tenantId, user.user_id, {
        email_verified: true,
      });
    }

    const loginSession = await ctx.env.data.loginSessions.create(tenantId, {
      expires_at: new Date(
        Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
      ).toISOString(),
      csrf_token: nanoid(),
      authorization_url: ctx.req.url,
      authParams: {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: "openid profile email",
        username: user.email,
      },
      user_id: user.user_id,
    });

    return ctx.redirect(
      `/u2/reset-password?state=${encodeURIComponent(loginSession.id)}`,
    );
  },
});

export const u2Routes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([
  getGuardianEnroll, getAcceptInvitation, postAcceptInvitation, getEmailVerificationTicket, getPasswordChangeTicket, getScreenRoute, postScreenRoute,
] as const);

u2Routes.doc("/spec", {
  openapi: "3.0.0",
  info: {
    version: "1.0.0",
    title: "U2 Universal Login (Client-side Widget)",
    description: `Client-side widget-based universal login. Available built-in screens: ${listScreenIds().join(", ")}`,
  },
});
