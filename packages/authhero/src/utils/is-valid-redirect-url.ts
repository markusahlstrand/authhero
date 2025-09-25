export function isValidRedirectUrl(
  url: string,
  allowedUrls: string[] = [],
  options: { allowPathWildcards?: boolean; enableSubDomainWildcards?: boolean } = {},
): boolean {
  try {
    const parsedUrl = new URL(url);
    return allowedUrls.some((allowedUrl) => {
      try {
        return matchUrl(
          parsedUrl,
          new URL(allowedUrl),
          options,
        );
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function matchUrl(
  url: URL,
  allowedUrl: URL,
  options: { allowPathWildcards?: boolean; enableSubDomainWildcards?: boolean } = {},
): boolean {
  // First validate protocol
  if (url.protocol !== allowedUrl.protocol) {
    return false;
  }

  // Handle path matching based on wildcard option
  if (options.allowPathWildcards && allowedUrl.pathname.includes("*")) {
    const pathPattern = allowedUrl.pathname
      .replace(/\*/g, ".*") // Convert * to .*
      .replace(/\//g, "\\/"); // Escape forward slashes
    const pathRegex = new RegExp(`^${pathPattern}$`);
    if (!pathRegex.test(url.pathname)) {
      return false;
    }
  } else if (url.pathname !== allowedUrl.pathname) {
    return false;
  }

  // Wildcard domain matching (only if enabled)
  if (
    options.enableSubDomainWildcards &&
    allowedUrl.hostname.startsWith("*.") &&
    allowedUrl.hostname.split(".").length > 2 &&
    ["http:", "https:"].includes(allowedUrl.protocol)
  ) {
    const allowedDomain = allowedUrl.hostname.split(".").slice(1).join(".");
    return url.hostname.endsWith(allowedDomain);
  }

  return url.hostname === allowedUrl.hostname;
}
