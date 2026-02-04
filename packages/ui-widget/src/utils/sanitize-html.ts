/**
 * Sanitize HTML to only allow safe formatting tags
 *
 * Allowed tags:
 * - <br>, <br/> - Line breaks
 * - <em>, <i> - Italic
 * - <strong>, <b> - Bold
 * - <u> - Underline
 * - <span> - Generic inline container (for styling)
 * - <a> - Links (href attribute only, with target="_blank" and rel="noopener")
 *
 * All other tags and attributes are stripped.
 */

// Allowed tags and their allowed attributes
const ALLOWED_TAGS: Record<string, string[]> = {
  br: [],
  em: [],
  i: [],
  strong: [],
  b: [],
  u: [],
  span: ["class"],
  a: ["href", "class"],
};

/**
 * Sanitize HTML string to only allow safe formatting tags
 *
 * @param html - The HTML string to sanitize
 * @returns Sanitized HTML string safe for innerHTML
 */
export function sanitizeHtml(html: string | undefined | null): string {
  if (!html) return "";

  // If no HTML tags present, return as-is (optimization)
  if (!/<[^>]+>/.test(html)) {
    return html;
  }

  // Use a simple regex-based approach that's safe for our limited use case
  // This avoids needing DOMParser which may not be available in all environments

  let result = html;

  // First, escape all HTML
  result = result
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // Then selectively re-enable allowed tags
  for (const [tag, allowedAttrs] of Object.entries(ALLOWED_TAGS)) {
    // Self-closing tags (like <br> and <br/>)
    if (tag === "br") {
      result = result.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
      continue;
    }

    // Opening tags with optional attributes
    const openingPattern = new RegExp(
      `&lt;${tag}((?:\\s+[a-z-]+(?:=&quot;[^&]*&quot;|=&#39;[^&]*&#39;)?)*)\\s*&gt;`,
      "gi",
    );

    result = result.replace(openingPattern, (_match, attrsStr) => {
      // Parse and filter attributes
      const filteredAttrs: string[] = [];

      if (attrsStr) {
        // Unescape the attributes string for parsing
        const unescapedAttrs = attrsStr
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">");

        // Extract attributes
        const attrPattern = /([a-z-]+)=["']([^"']*)["']/gi;
        let attrMatch;
        while ((attrMatch = attrPattern.exec(unescapedAttrs)) !== null) {
          const [, attrName, attrValue] = attrMatch;
          if (attrName && allowedAttrs.includes(attrName.toLowerCase())) {
            // For href, validate it's a safe URL
            if (attrName.toLowerCase() === "href") {
              if (isSafeUrl(attrValue || "")) {
                filteredAttrs.push(`${attrName}="${escapeAttr(attrValue || "")}"`);
              }
            } else {
              filteredAttrs.push(`${attrName}="${escapeAttr(attrValue || "")}"`);
            }
          }
        }
      }

      // For <a> tags, always add security attributes
      if (tag === "a") {
        filteredAttrs.push('target="_blank"');
        filteredAttrs.push('rel="noopener noreferrer"');
      }

      const attrsOutput = filteredAttrs.length
        ? " " + filteredAttrs.join(" ")
        : "";
      return `<${tag}${attrsOutput}>`;
    });

    // Closing tags
    const closingPattern = new RegExp(`&lt;/${tag}&gt;`, "gi");
    result = result.replace(closingPattern, `</${tag}>`);
  }

  return result;
}

/**
 * Check if a URL is safe (http, https, or relative)
 */
function isSafeUrl(url: string): boolean {
  if (!url) return false;

  // Allow relative URLs
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("?")) {
    return true;
  }

  // Allow http and https
  try {
    const parsed = new URL(url, "https://example.com");
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Escape attribute value
 */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
