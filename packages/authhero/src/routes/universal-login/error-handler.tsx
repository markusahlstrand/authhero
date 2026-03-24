/**
 * Shared error handler for universal login routes (/u/ and /u2/).
 *
 * Renders a branded HTML error page instead of returning plain text or JSON.
 */

import { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { RedirectException } from "../../errors/redirect-exception";
import { DEFAULT_THEME } from "../../constants/defaultTheme";
import { extractBrandingProps } from "./u2-widget-page";
import type { DarkModePreference } from "./u2-widget-page";
import { ErrorPage } from "./error-page";
import type { Bindings, Variables } from "../../types";
import type { Branding, Theme } from "@authhero/adapter-interfaces";
import { getCookie } from "hono/cookie";

/**
 * Map technical error messages to user-friendly ones.
 */
function getUserFriendlyMessage(err: Error): string {
  const msg = err.message || "";

  // Handle JSONHTTPException messages (JSON-encoded)
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.message) {
      return mapMessage(parsed.message);
    }
  } catch {
    // Not JSON, use raw message
  }

  return mapMessage(msg);
}

function mapMessage(msg: string): string {
  if (msg.toLowerCase().includes("login session not found")) {
    return "Your login session has expired or is invalid. Please go back to the application and try signing in again.";
  }
  if (msg.toLowerCase().includes("login session closed")) {
    return "Your login session has ended. Please return to the application and try again.";
  }
  return "An unexpected error occurred. Please try again later.";
}

/**
 * Create an async onError handler that renders a branded error page.
 */
export function createUniversalLoginErrorHandler() {
  return async (
    err: Error,
    c: Context<{ Bindings: Bindings; Variables: Variables }>,
  ) => {
    // Handle redirects (unchanged behavior)
    if (err instanceof RedirectException) {
      return c.redirect(err.location, err.status);
    }

    const status = err instanceof HTTPException ? err.status : 500;

    // For JSON API requests (e.g. /u2/screen/*), return JSON errors
    const accept = c.req.header("Accept") || "";
    const isScreenApi = c.req.path.includes("/screen/");
    if (isScreenApi && accept.includes("application/json")) {
      const errMessage =
        err instanceof HTTPException ? err.message : "Internal server error";
      if (status >= 500) {
        console.error(
          `[screen-api] ${c.req.method} ${c.req.path} ${status}:`,
          err,
        );
      }
      return c.json({ error: errMessage }, status as any);
    }

    const message =
      status === 500
        ? "An unexpected error occurred. Please try again later."
        : getUserFriendlyMessage(err);

    // Try to fetch tenant branding for a branded error page
    let branding: Branding | null = null;
    let theme: Theme | null = null;
    try {
      const tenantId = c.var?.tenant_id;
      if (tenantId && c.env?.data) {
        [theme, branding] = await Promise.all([
          c.env.data.themes.get(tenantId, "default"),
          c.env.data.branding.get(tenantId),
        ]);
      }
    } catch {
      // Fall back to default styling if branding fetch fails
    }

    const resolvedTheme = theme ?? DEFAULT_THEME;

    // Strip favicon_url when not on a custom domain
    const brandingWithFavicon = branding
      ? {
          ...branding,
          favicon_url: c.var?.custom_domain ? branding.favicon_url : undefined,
        }
      : null;

    const darkModeCookie = getCookie(c, "ah-dark-mode");
    const darkMode: DarkModePreference =
      darkModeCookie === "dark" || darkModeCookie === "light"
        ? darkModeCookie
        : "auto";

    return c.html(
      <ErrorPage
        message={message}
        statusCode={status}
        branding={extractBrandingProps(brandingWithFavicon)}
        theme={resolvedTheme}
        darkMode={darkMode}
      />,
      status,
    );
  };
}
