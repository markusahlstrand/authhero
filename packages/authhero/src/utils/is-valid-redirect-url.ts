export function isValidRedirectUrl(
  url: string,
  allowedUrls: string[] = [],
  options: {
    allowPathWildcards?: boolean;
    allowSubDomainWildcards?: boolean;
  } = {},
): boolean {
  try {
    const parsedUrl = new URL(url);
    return allowedUrls.some((allowedUrl) => {
      try {
        return matchUrl(parsedUrl, new URL(allowedUrl), options);
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
  options: {
    allowPathWildcards?: boolean;
    allowSubDomainWildcards?: boolean;
  } = {},
): boolean {
  // First validate protocol
  if (url.protocol !== allowedUrl.protocol) {
    return false;
  }

  // Handle path matching based on wildcard option
  const usesPathWildcard =
    !!options.allowPathWildcards && allowedUrl.pathname.includes("*");
  if (usesPathWildcard) {
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

  const usesHostWildcard =
    !!options.allowSubDomainWildcards &&
    allowedUrl.hostname.startsWith("*.") &&
    allowedUrl.hostname.split(".").length > 2 &&
    ["http:", "https:"].includes(allowedUrl.protocol);

  // For exact (non-wildcard) registrations, the match must be strict: the
  // incoming URL may not carry any extra parameter the registered URL doesn't
  // pin. OAuth2 (RFC 6749 §3.1.2.3) and OIDC require redirect_uri to match a
  // registered value, and the OIDC conformance suite's
  // `oidcc-redirect-uri-query-added` adds a query parameter to an otherwise
  // registered URI and expects the server to refuse to redirect. Wildcard
  // registrations are an authhero extension that already signal a looser,
  // pattern-style match (e.g. the auth server's own `<issuer>/*` callback used
  // by the account flow, where the current URL legitimately carries query
  // params), so the strict checks are skipped for them.
  const strictParams = !usesPathWildcard && !usesHostWildcard;

  // Query parameter matching. Every registered parameter must always appear
  // unchanged on the incoming URL. Use getAll so a key registered (or supplied)
  // multiple times is matched by both value and multiplicity — comparing only
  // the first value would let a duplicate query parameter bypass the check.
  for (const key of new Set(allowedUrl.searchParams.keys())) {
    const allowedValues = allowedUrl.searchParams.getAll(key).sort();
    const actualValues = url.searchParams.getAll(key);

    if (strictParams) {
      const sortedActual = actualValues.slice().sort();
      if (
        allowedValues.length !== sortedActual.length ||
        !allowedValues.every((value, i) => value === sortedActual[i])
      ) {
        return false;
      }
    } else {
      // Wildcard registrations only require each registered value to be present.
      const remaining = actualValues.slice();
      for (const value of allowedValues) {
        const idx = remaining.indexOf(value);
        if (idx === -1) {
          return false;
        }
        remaining.splice(idx, 1);
      }
    }
  }

  if (strictParams) {
    for (const key of url.searchParams.keys()) {
      if (!allowedUrl.searchParams.has(key)) {
        return false;
      }
    }
  }

  // Wildcard domain matching (only if enabled)
  if (usesHostWildcard) {
    const allowedDomain = allowedUrl.hostname.split(".").slice(1).join(".");
    // Check if it ends with the domain AND has a dot before it (proper subdomain)
    // OR if it's an exact match to the domain
    return (
      url.hostname === allowedDomain ||
      url.hostname.endsWith("." + allowedDomain)
    );
  }

  return url.hostname === allowedUrl.hostname;
}
