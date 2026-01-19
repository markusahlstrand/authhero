export function setSearchParams(
  url: URL,
  params: { [key: string]: string | undefined | null },
) {
  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value.length) {
      url.searchParams.set(key, value as string);
    }
  });
}

/**
 * Redacts sensitive data from a URL for logging purposes.
 * Shows parameter names but redacts their values to aid troubleshooting
 * while protecting PII, tokens, and other sensitive information.
 *
 * @param url - The URL to redact (can be a string or URL object)
 * @returns The redacted URL with parameter names visible but values hidden
 *
 * @example
 * redactUrlForLogging("https://example.com/path?token=secret&code=abc#id_token=jwt")
 * // Returns: "https://example.com/path?token=[REDACTED]&code=[REDACTED]#[REDACTED]"
 */
export function redactUrlForLogging(url: string | URL): string {
  try {
    const parsedUrl = typeof url === "string" ? new URL(url) : url;
    let result = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
    
    // Redact query parameters but show their names
    if (parsedUrl.search) {
      const params = Array.from(parsedUrl.searchParams.keys())
        .map(key => `${key}=[REDACTED]`)
        .join("&");
      result += `?${params}`;
    }
    
    // Show that a hash exists but redact its content
    if (parsedUrl.hash) {
      result += "#[REDACTED]";
    }
    
    return result;
  } catch {
    // If URL parsing fails, handle relative paths
    const urlString = typeof url === "string" ? url : url.toString();
    const pathMatch = urlString.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
    
    if (!pathMatch) return "[invalid-url]";
    
    const [, path = "", search, hash] = pathMatch;
    let result = path;
    
    // Redact query parameters in relative URLs
    if (search) {
      const params = search.substring(1).split("&")
        .map(param => {
          const [key] = param.split("=");
          return `${key}=[REDACTED]`;
        })
        .join("&");
      result += `?${params}`;
    }
    
    // Show that a hash exists but redact its content
    if (hash) {
      result += "#[REDACTED]";
    }
    
    return result;
  }
}
