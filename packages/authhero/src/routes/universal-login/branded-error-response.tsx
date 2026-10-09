/**
 * Resolves tenant branding for the branded error page and renders it as an
 * HTML response. Shared by the universal-login error handler and the
 * browser-facing auth-api endpoints (e.g. logout) that would otherwise reply
 * with a bare text error.
 */

import { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DEFAULT_THEME } from "../../constants/defaultTheme";
import { extractBrandingProps, resolveDarkMode } from "./u2-widget-page";
import { ErrorPage, ErrorPageProps } from "./error-page";
import type { Bindings, Variables } from "../../types";
import type { Branding, Theme } from "@authhero/adapter-interfaces";

type Ctx = Context<{ Bindings: Bindings; Variables: Variables }>;

export async function resolveErrorPageBranding(
  ctx: Ctx,
  tenantId: string | undefined,
): Promise<Pick<ErrorPageProps, "branding" | "theme" | "darkMode">> {
  let branding: Branding | null = null;
  let theme: Theme | null = null;
  try {
    if (tenantId && ctx.env?.data) {
      [theme, branding] = await Promise.all([
        ctx.env.data.themes.get(tenantId, "default"),
        ctx.env.data.branding.get(tenantId),
      ]);
    }
  } catch {
    // Fall back to default styling if branding fetch fails
  }

  // Strip favicon_url when not on a custom domain
  const brandingWithFavicon = branding
    ? {
        ...branding,
        favicon_url: ctx.var?.custom_domain ? branding.favicon_url : undefined,
      }
    : null;

  return {
    branding: extractBrandingProps(brandingWithFavicon),
    theme: theme ?? DEFAULT_THEME,
    darkMode: resolveDarkMode(ctx, brandingWithFavicon),
  };
}

export async function renderBrandedErrorPage(
  ctx: Ctx,
  tenantId: string | undefined,
  status: ContentfulStatusCode,
  props: Omit<ErrorPageProps, "statusCode" | "branding" | "theme" | "darkMode">,
) {
  const brandingProps = await resolveErrorPageBranding(ctx, tenantId);
  return ctx.html(
    <ErrorPage {...props} statusCode={status} {...brandingProps} />,
    status,
    { "Cache-Control": "no-store" },
  );
}

/**
 * The host of an (unvalidated) return URL, for display on an error page.
 * Falls back to the raw value when it isn't a parseable absolute URL.
 */
export function describeReturnToHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function renderInvalidLogoutUrlPage(
  ctx: Ctx,
  tenantId: string,
  returnTo: string,
) {
  // Logout is a browser navigation away from the app, so a misconfigured
  // "Allowed Logout URLs" list must not leave the user on a bare text error.
  // The session is left intact (as Auth0 does) and the page says so.
  return renderBrandedErrorPage(ctx, tenantId, 400, {
    title: "We couldn't sign you out",
    message: `The page you were returning to (${describeReturnToHost(returnTo)}) isn't an allowed logout URL for this application, so you are still signed in. Please contact the site's support.`,
  });
}
