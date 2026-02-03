/**
 * Sanitization utilities for universal login routes
 *
 * These helpers provide XSS protection and input sanitization for
 * rendering HTML pages with user-controlled or dynamic content.
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Escape a string for use in JavaScript string literals
 */
export function escapeJs(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/</g, "\\x3c")
    .replace(/>/g, "\\x3e");
}

/**
 * Escape a URL for safe use inside CSS url("...") function.
 * This prevents CSS injection by escaping characters that could
 * break out of the url() context.
 */
export function escapeCssUrl(url: string): string {
  return url
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, '\\"') // Escape double quotes (we use quoted url syntax)
    .replace(/'/g, "\\'") // Escape single quotes for safety
    .replace(/\(/g, "\\(") // Escape parentheses
    .replace(/\)/g, "\\)") // Escape parentheses
    .replace(/\n/g, "") // Remove newlines (CSS injection vector)
    .replace(/\r/g, "") // Remove carriage returns
    .replace(/\t/g, ""); // Remove tabs
}

/**
 * Sanitize URL for use in href/src attributes
 */
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "data:"].includes(parsed.protocol)) {
      return "";
    }
    return escapeHtml(url);
  } catch {
    if (url.startsWith("/")) {
      return escapeHtml(url);
    }
    return "";
  }
}

/**
 * Sanitize CSS color value
 */
export function sanitizeCssColor(color: string | undefined): string {
  if (!color) return "";
  const safeColorPattern =
    /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)$/;
  if (safeColorPattern.test(color.trim())) {
    return color.trim();
  }
  return "";
}

/**
 * Build CSS background from page_background (branding format)
 */
export function buildPageBackground(
  pageBackground:
    | string
    | { type?: string; start?: string; end?: string; angle_deg?: number }
    | undefined,
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
 * Build CSS background from theme's page_background (supports background_image_url)
 */
export function buildThemePageBackground(
  themePageBackground:
    | {
        background_color?: string;
        background_image_url?: string;
        page_layout?: string;
      }
    | undefined,
  fallbackBrandingBackground:
    | string
    | { type?: string; start?: string; end?: string; angle_deg?: number }
    | undefined,
): string {
  // If theme has a background_image_url, use it
  if (themePageBackground?.background_image_url) {
    const imageUrl = sanitizeUrl(themePageBackground.background_image_url);
    if (imageUrl) {
      const bgColor =
        sanitizeCssColor(themePageBackground.background_color) || "#f5f5f5";
      // Use quoted url() syntax with CSS-escaped URL to prevent CSS injection
      return `${bgColor} url("${escapeCssUrl(imageUrl)}") center / cover no-repeat`;
    }
  }

  // If theme has a background_color, use it
  if (themePageBackground?.background_color) {
    const bgColor = sanitizeCssColor(themePageBackground.background_color);
    if (bgColor) return bgColor;
  }

  // Fall back to branding page_background
  return buildPageBackground(fallbackBrandingBackground);
}

/**
 * Safely serialize JSON for embedding in <script> tags
 * Escapes characters that could break out of script context
 */
export function safeJsonStringify(obj: unknown): string {
  const json = JSON.stringify(obj);
  return json
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
