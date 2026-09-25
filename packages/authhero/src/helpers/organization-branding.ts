import { Branding, Organization, Theme } from "@authhero/adapter-interfaces";

type OrganizationBranding = NonNullable<Organization["branding"]>;

/**
 * Layer an organization's branding over the tenant's branding and theme, the
 * way Auth0 does when a login runs in the context of an organization.
 *
 * The login pages let the theme win over branding (`theme.widget.logo_url`
 * before `branding.logo_url`, `theme.colors.primary_button` before
 * `branding.colors.primary`, `theme.page_background` before
 * `branding.colors.page_background`), and a theme always exists because of
 * the DEFAULT_THEME fallback. So each org value is written into both, or it
 * would never be visible.
 */
export function applyOrganizationBranding(
  branding: Branding | null,
  theme: Theme,
  orgBranding: OrganizationBranding | undefined,
): { branding: Branding | null; theme: Theme } {
  if (!orgBranding) {
    return { branding, theme };
  }

  const logoUrl = orgBranding.logo_url || undefined;
  const primary = orgBranding.colors?.primary || undefined;
  const pageBackground = orgBranding.colors?.page_background || undefined;

  if (!logoUrl && !primary && !pageBackground) {
    return { branding, theme };
  }

  const baseColors = branding?.colors;
  const colors =
    primary || pageBackground || baseColors
      ? {
          ...baseColors,
          // Branding requires a primary color; without one from the org or
          // the tenant, keep the color the theme already renders.
          primary:
            primary ?? baseColors?.primary ?? theme.colors.primary_button,
          ...(pageBackground ? { page_background: pageBackground } : {}),
        }
      : undefined;

  const mergedBranding: Branding = {
    ...branding,
    ...(logoUrl ? { logo_url: logoUrl } : {}),
    ...(colors ? { colors } : {}),
  };

  const mergedTheme: Theme = {
    ...theme,
    colors: primary
      ? { ...theme.colors, primary_button: primary }
      : theme.colors,
    widget: logoUrl ? { ...theme.widget, logo_url: logoUrl } : theme.widget,
    // A tenant background image would hide the organization's color, so the
    // org color replaces the whole background rather than tinting under it.
    page_background: pageBackground
      ? {
          ...theme.page_background,
          background_color: pageBackground,
          background_image_url: "",
        }
      : theme.page_background,
  };

  return { branding: mergedBranding, theme: mergedTheme };
}
