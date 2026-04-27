/**
 * Validates an origin (scheme + host + port) supplied to `/connect/start`.
 *
 * HTTPS origins are always permitted. HTTP origins are permitted only when
 * the host is loopback (RFC 8252 §7.3) or the exact origin appears in the
 * tenant's `allow_http_return_to` allowlist.
 */

export type ValidConnectOrigin = {
  ok: true;
  origin: string;
  isLoopback: boolean;
  isAllowlisted: boolean;
  isHttp: boolean;
};

export type InvalidConnectOrigin = { ok: false; reason: string };

export type ConnectOriginResult = ValidConnectOrigin | InvalidConnectOrigin;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function validateConnectOrigin(
  raw: string,
  allowHttp: readonly string[] = [],
): ConnectOriginResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "scheme must be http or https" };
  }

  // URL.hostname is already lowercased and IDNA-encoded by the platform.
  // Strip a single trailing dot so `localhost.` matches `localhost`.
  const hostname = url.hostname.replace(/\.$/, "");
  if (!hostname) {
    return { ok: false, reason: "missing host" };
  }
  if (hostname === "0.0.0.0" || hostname === "[::]") {
    return { ok: false, reason: "unspecified address is not a valid origin" };
  }

  const port = url.port ? `:${url.port}` : "";
  const origin = `${url.protocol}//${hostname}${port}`;

  if (url.protocol === "https:") {
    return {
      ok: true,
      origin,
      isLoopback: false,
      isAllowlisted: false,
      isHttp: false,
    };
  }

  if (LOOPBACK_HOSTS.has(hostname)) {
    return {
      ok: true,
      origin,
      isLoopback: true,
      isAllowlisted: false,
      isHttp: true,
    };
  }

  const normalizedAllow = allowHttp.map((a) => a.toLowerCase());
  if (normalizedAllow.includes(origin)) {
    return {
      ok: true,
      origin,
      isLoopback: false,
      isAllowlisted: true,
      isHttp: true,
    };
  }

  return {
    ok: false,
    reason: "http origin requires loopback or tenant allowlist",
  };
}
