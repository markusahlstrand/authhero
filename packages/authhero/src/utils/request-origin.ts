/**
 * Check whether a request's Origin header matches one of the allowed
 * domains, comparing by URL host (replaces oslo/request). Entries may be
 * bare hosts or full origins; comparison ignores scheme and path.
 */
export function verifyRequestOrigin(
  origin: string | null | undefined,
  allowedDomains: string[],
): boolean {
  if (!origin || allowedDomains.length === 0) {
    return false;
  }
  const originHost = safeHost(origin);
  if (!originHost) {
    return false;
  }
  return allowedDomains.some((domain) => {
    const host =
      domain.startsWith("http://") || domain.startsWith("https://")
        ? safeHost(domain)
        : safeHost(`https://${domain}`);
    return host !== null && host === originHost;
  });
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
