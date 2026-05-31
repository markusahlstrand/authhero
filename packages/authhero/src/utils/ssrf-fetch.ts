const PRIVATE_IPV4_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, // link-local
  /^127\./, // loopback
  /^0\./, // current network
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

function isBlockedIPv6(hostname: string): boolean {
  // Strip the surrounding brackets that URL parsing leaves on IPv6 literals.
  const h = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique local

  // Link-local is fe80::/10, i.e. the top 10 bits are 1111111010. That
  // covers the entire range fe80:: – febf:ffff:…, not just fe80:* literals.
  const firstHextet = h.split(":")[0];
  if (firstHextet && /^[0-9a-f]+$/.test(firstHextet)) {
    const value = parseInt(firstHextet, 16);
    if (!Number.isNaN(value) && value >= 0xfe80 && value <= 0xfebf) {
      return true;
    }
  }

  // IPv4-mapped (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) and IPv4-compatible
  // (::a.b.c.d / ::xxxx:xxxx) addresses smuggle an IPv4 inside an IPv6
  // literal. Decode the embedded IPv4 and recheck against IPv4 rules.
  const embeddedV4 = extractEmbeddedIPv4(h);
  if (embeddedV4 && isBlockedIPv4(embeddedV4)) return true;

  return false;
}

function extractEmbeddedIPv4(h: string): string | null {
  // ::ffff:a.b.c.d or ::a.b.c.d — already in dotted form.
  const dottedMatch = h.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/);
  if (dottedMatch && dottedMatch[1]) return dottedMatch[1];

  // ::ffff:xxxx:xxxx or ::xxxx:xxxx — last two hextets encode the IPv4.
  const hexMatch = h.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMatch && hexMatch[1] && hexMatch[2]) {
    const hi = parseInt(hexMatch[1], 16);
    const lo = parseInt(hexMatch[2], 16);
    if (!Number.isNaN(hi) && !Number.isNaN(lo)) {
      return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
    }
  }
  return null;
}

function isBlockedIPv4(hostname: string): boolean {
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return false;
  return PRIVATE_IPV4_PATTERNS.some((re) => re.test(hostname));
}

export interface SsrfFetchOptions {
  /** Max bytes to read from the response body. Defaults to 64 KiB. */
  maxBytes?: number;
  /** Request timeout in ms. Defaults to 5000ms. */
  timeoutMs?: number;
  /** Allowed schemes. Defaults to ["https:"]. Set to ["http:", "https:"] for tests. */
  allowedSchemes?: string[];
  /**
   * When true, hostnames resolving to private/loopback ranges (and
   * `localhost`) are allowed. Intended for tests only.
   */
  allowPrivateHosts?: boolean;
}

/**
 * Build SSRF fetch options from the environment. In production only https and
 * public hosts are allowed; the `ALLOW_PRIVATE_OUTBOUND_FETCH` override (tests
 * and local dev) relaxes this so loopback/http targets can be reached.
 */
export function ssrfFetchOptionsFromEnv(env: {
  ALLOW_PRIVATE_OUTBOUND_FETCH?: boolean;
}): SsrfFetchOptions {
  const allowPrivate = env.ALLOW_PRIVATE_OUTBOUND_FETCH === true;
  return {
    allowPrivateHosts: allowPrivate,
    allowedSchemes: allowPrivate ? ["http:", "https:"] : ["https:"],
  };
}

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`SSRF check failed: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * Inspect a URL string and throw {@link SsrfBlockedError} if its literal
 * hostname is an IP address in a blocked range (see {@link isBlockedIPv4},
 * {@link isBlockedIPv6}) or a known loopback/broadcast hostname (see
 * {@link BLOCKED_HOSTNAMES}).
 *
 * IMPORTANT: this function does NOT perform DNS resolution. A public-looking
 * hostname whose A/AAAA records point to a private/loopback/metadata IP will
 * pass this check and only be rejected later (or not at all) by the underlying
 * fetch. Production deployments that need full SSRF protection must add either:
 *   - egress controls (firewall / network policy blocking RFC1918 + 169.254 +
 *     fc00::/7 + fe80::/10 from the auth server), or
 *   - a server-side DNS check that resolves the host with `dns.lookup` and
 *     re-runs {@link isBlockedIPv4}/{@link isBlockedIPv6} on each address (or
 *     connect by resolved IP while passing the original Host header).
 */
export function assertSsrfSafeUrl(
  rawUrl: string,
  opts: SsrfFetchOptions = {},
): URL {
  const allowedSchemes = opts.allowedSchemes ?? ["https:"];
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("invalid URL");
  }
  if (!allowedSchemes.includes(url.protocol)) {
    throw new SsrfBlockedError(`scheme ${url.protocol} not allowed`);
  }
  if (opts.allowPrivateHosts) return url;

  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new SsrfBlockedError(`hostname ${host} blocked`);
  }
  if (isBlockedIPv4(host)) {
    throw new SsrfBlockedError(`IPv4 ${host} is in a blocked range`);
  }
  if (host.includes(":") && isBlockedIPv6(host)) {
    throw new SsrfBlockedError(`IPv6 ${host} is in a blocked range`);
  }
  return url;
}

/**
 * Fetch a URL with SSRF protection: blocks private/loopback/link-local
 * targets, requires https by default, applies a strict timeout, and caps the
 * response body. Intended for fetching client-published artifacts (jwks_uri,
 * request_uri) where the URL comes from untrusted client metadata.
 */
export async function ssrfSafeFetch(
  rawUrl: string,
  opts: SsrfFetchOptions = {},
): Promise<{ status: number; body: string; contentType: string | null }> {
  const url = assertSsrfSafeUrl(rawUrl, opts);
  const maxBytes = opts.maxBytes ?? 64 * 1024;
  const timeoutMs = opts.timeoutMs ?? 5000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Cloudflare Workers' fetch only accepts "follow" or "manual" for
    // `redirect`; passing "error" throws TypeError at runtime. Use "manual"
    // and reject 3xx ourselves so the no-redirect property still holds.
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "application/json, application/jwt, text/plain" },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new SsrfBlockedError(
        `redirect (status ${response.status}) not allowed`,
      );
    }

    if (!response.body) {
      return {
        status: response.status,
        body: "",
        contentType: response.headers.get("content-type"),
      };
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          throw new SsrfBlockedError(`response body exceeds ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.byteLength;
    }
    return {
      status: response.status,
      body: new TextDecoder().decode(merged),
      contentType: response.headers.get("content-type"),
    };
  } finally {
    clearTimeout(timer);
  }
}
