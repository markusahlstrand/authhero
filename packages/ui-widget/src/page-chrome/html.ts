/**
 * HTML/CSS escaping and sanitization for the page chrome.
 *
 * Self-contained on purpose: this module is consumed both by the authhero
 * server (which has its own copy of these primitives in
 * `sanitization-utils.ts` for its other routes) and by the widget demo
 * server. Security primitives are deliberately NOT shared across the package
 * boundary — they are small, stable, and a broken import here would silently
 * weaken escaping on every login page.
 */

/** Escape HTML special characters to prevent XSS. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Escape a URL for safe use inside a CSS `url("...")` function, so a crafted
 * image URL can't break out of the url() context and inject rules.
 */
export function escapeCssUrl(url: string): string {
  return url
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/'/g, "\\'")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\n/g, "")
    .replace(/\r/g, "")
    .replace(/\t/g, "");
}

/** True for URLs we're willing to emit: http(s)/data, or root-relative. */
function isAllowedUrl(url: string): boolean {
  try {
    return ["http:", "https:", "data:"].includes(new URL(url).protocol);
  } catch {
    return url.startsWith("/");
  }
}

/** Sanitize a URL for use in href/src attributes. Returns "" if unsafe. */
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  return isAllowedUrl(url) ? escapeHtml(url) : "";
}

/**
 * Sanitize a URL for use inside a CSS `url("...")`. Returns "" if unsafe.
 *
 * Deliberately not `sanitizeUrl` + `escapeCssUrl`: HTML entities are never
 * decoded inside a `<style>` element, so HTML-escaping here would put the
 * literal text `&amp;` into the stylesheet and corrupt every query string it
 * touches — a signed `?sig=x&expires=y` would be requested as
 * `?sig=x&amp;expires=y` and the image would fail to load.
 *
 * Angle brackets still have to go, or a `</style>` inside the URL would end
 * the element and let the rest of it parse as markup. They are percent-encoded
 * rather than entity-encoded so the URL stays a valid URL.
 */
export function sanitizeCssUrl(url: string | undefined): string {
  if (!url) return "";
  if (!isAllowedUrl(url)) return "";
  return escapeCssUrl(url.replace(/</g, "%3C").replace(/>/g, "%3E"));
}

/** Sanitize a CSS color value. Returns "" if it doesn't look like a color. */
export function sanitizeCssColor(color: string | undefined): string {
  if (!color) return "";
  const safeColorPattern =
    /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)$/;
  if (safeColorPattern.test(color.trim())) {
    return color.trim();
  }
  return "";
}

/** Branding-shaped page background: a flat color or a gradient descriptor. */
export type BrandingPageBackground =
  | string
  | { type?: string; start?: string; end?: string; angle_deg?: number };

/** Theme-shaped page background, which may carry an image. */
export type ThemePageBackground = {
  background_color?: string;
  background_image_url?: string;
  page_layout?: string;
};

/** Build a CSS `background` value from a branding page_background. */
export function buildPageBackground(
  pageBackground: BrandingPageBackground | undefined,
): string {
  if (!pageBackground) return "#f5f5f5";

  if (typeof pageBackground === "string") {
    return sanitizeCssColor(pageBackground) || "#f5f5f5";
  }

  const { type, start, end, angle_deg } = pageBackground;

  if (type === "linear-gradient" && start && end) {
    const sanitizedStart = sanitizeCssColor(start);
    const sanitizedEnd = sanitizeCssColor(end);
    if (sanitizedStart && sanitizedEnd) {
      const angle = typeof angle_deg === "number" ? angle_deg : 180;
      return `linear-gradient(${angle}deg, ${sanitizedStart}, ${sanitizedEnd})`;
    }
  }

  if (start) {
    const sanitizedColor = sanitizeCssColor(start);
    if (sanitizedColor) return sanitizedColor;
  }

  return "#f5f5f5";
}

/**
 * Build a CSS `background` value from a theme page_background, falling back
 * to the branding one. Supports `background_image_url`.
 */
export function buildThemePageBackground(
  themePageBackground: ThemePageBackground | undefined,
  fallbackBrandingBackground: BrandingPageBackground | undefined,
): string {
  if (themePageBackground?.background_image_url) {
    const imageUrl = sanitizeCssUrl(themePageBackground.background_image_url);
    if (imageUrl) {
      const bgColor =
        sanitizeCssColor(themePageBackground.background_color) || "#f5f5f5";
      return `${bgColor} url("${imageUrl}") center / cover no-repeat`;
    }
  }

  if (themePageBackground?.background_color) {
    const bgColor = sanitizeCssColor(themePageBackground.background_color);
    if (bgColor) return bgColor;
  }

  return buildPageBackground(fallbackBrandingBackground);
}
