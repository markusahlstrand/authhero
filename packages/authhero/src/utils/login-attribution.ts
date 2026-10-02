/**
 * Marketing attribution for a login, read from the original `/authorize` URL.
 *
 * Only allowlisted parameters are kept. The full URL also carries
 * `login_hint`, `state`, `nonce` and similar values that don't belong in
 * tenant logs, and log stores such as Analytics Engine cap each blob at
 * 1024 bytes.
 */

/** Click identifiers kept alongside every `utm_*` parameter. */
const CLICK_ID_PARAMS = new Set(["gclid", "fbclid", "msclkid"]);
const UTM_PREFIX = "utm_";

/** Bounds that keep the attribution well inside one log blob. */
const MAX_PARAMS = 10;
const MAX_NAME_LENGTH = 32;
const MAX_VALUE_LENGTH = 128;

function isAttributionParam(name: string): boolean {
  return (
    CLICK_ID_PARAMS.has(name) ||
    (name.startsWith(UTM_PREFIX) && name.length > UTM_PREFIX.length)
  );
}

/**
 * Returns the attribution parameters in `authorizationUrl`, or undefined when
 * there are none (or the URL can't be parsed). Names are lowercased, empty
 * values are dropped, a repeated parameter keeps its first value, and values
 * are truncated to a bounded length.
 */
export function extractLoginAttribution(
  authorizationUrl: string | undefined,
): Record<string, string> | undefined {
  if (!authorizationUrl) return undefined;

  let params: URLSearchParams;
  try {
    params = new URL(authorizationUrl).searchParams;
  } catch {
    return undefined;
  }

  const attribution: Record<string, string> = {};
  let count = 0;
  for (const [rawName, value] of params) {
    const name = rawName.toLowerCase();
    if (name.length > MAX_NAME_LENGTH || !isAttributionParam(name)) continue;
    if (!value || name in attribution) continue;
    attribution[name] = value.slice(0, MAX_VALUE_LENGTH);
    if (++count >= MAX_PARAMS) break;
  }

  return count > 0 ? attribution : undefined;
}
