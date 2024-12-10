export function isValidRedirectUrl(redirectUrl: string, allowedUrls: string[]) {
  try {
    const redirect = new URL(redirectUrl);

    return allowedUrls.some((allowed) => {
      const allowedUrl = new URL(allowed);

      // Validate protocol
      const isProtocolValid = redirect.protocol === allowedUrl.protocol;

      // Validate pathname
      const isPathnameValid = redirect.pathname === allowedUrl.pathname;

      // Validate hostname
      const isHostnameValid = allowedUrl.hostname.includes("*")
        ? matchWildcardHostname(redirect, allowedUrl)
        : redirect.hostname === allowedUrl.hostname;

      return isProtocolValid && isPathnameValid && isHostnameValid;
    });
  } catch {
    // If URL parsing fails, it's invalid
    return false;
  }
}

function matchWildcardHostname(redirect: URL, allowedUrl: URL) {
  // Wildcards are only valid for http and https
  if (allowedUrl.protocol !== "http:" && allowedUrl.protocol !== "https:") {
    return false;
  }

  const allowedHostname = allowedUrl.hostname;
  const redirectHostname = redirect.hostname;

  // Validate wildcard placement
  const [prefix, suffix] = allowedHostname.split("*");
  if (!suffix || allowedHostname.split("*").length > 2) {
    return false; // More than one wildcard or invalid wildcard
  }

  const wildcardIndex = allowedHostname.indexOf("*");
  if (wildcardIndex !== allowedHostname.indexOf(".") + 1) {
    return false; // Wildcard not in subdomain closest to root
  }

  // Validate single-level subdomain match
  return (
    redirectHostname.startsWith(prefix || "") &&
    redirectHostname.endsWith(suffix) &&
    redirectHostname.split(".").length === suffix.split(".").length + 1
  );
}
