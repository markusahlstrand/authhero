export function isValidRedirectUrl(
  url: string,
  allowedUrls: string[],
): boolean {
  try {
    // Parse the input URL
    const parsedUrl = new URL(url);

    // Check if any of the allowed URLs match
    return allowedUrls.some((allowedUrl) => {
      // Exact URL matching
      try {
        return matchUrl(parsedUrl, new URL(allowedUrl));
      } catch {
        // Invalid allowed URL format
        return false;
      }
    });
  } catch {
    // Invalid URL format
    return false;
  }
}

function matchUrl(url: URL, allowedUrl: URL): boolean {
  // First valiaate protocol and pathname
  if (
    url.protocol !== allowedUrl.protocol ||
    url.pathname !== allowedUrl.pathname
  ) {
    return false;
  }

  // Wildcard domain matching
  if (
    // Only allow wildcard domains with a single subdomain
    allowedUrl.hostname.startsWith("*.") &&
    // Ensure that it's not a top-level wildcard domain
    allowedUrl.hostname.split(".").length > 2 &&
    // Ensure that the protocol is HTTP or HTTPS
    ["http:", "https:"].includes(allowedUrl.protocol)
  ) {
    const allowedDomain = allowedUrl.hostname.split(".").slice(1).join(".");
    return url.hostname.endsWith(allowedDomain);
  }

  return url.hostname === allowedUrl.hostname;
}
