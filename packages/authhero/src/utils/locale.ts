/**
 * Locale resolution for the universal login pages.
 *
 * This is deliberately separate from the `detectLanguage` helpers used to pick
 * translations: those reduce a tag to its language subtag ("en-GB" -> "en"),
 * which is the right key for a translation catalogue but throws away the
 * region — and the region is what decides whether a date reads DD/MM/YYYY or
 * MM/DD/YYYY. This keeps the full tag for formatting decisions.
 */

/** A conservative BCP-47 shape: language, optional script, optional region. */
const BCP47 = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/i;

/**
 * The `q` weight of an `Accept-Language` entry's parameters, defaulting to 1
 * when the entry carries none (RFC 9110 §12.4.2).
 */
function parseQuality(params: string[]): number {
  for (const param of params) {
    const match = /^\s*q\s*=\s*([\d.]+)\s*$/i.exec(param);
    if (match) {
      const q = Number(match[1]);
      return Number.isFinite(q) ? q : 1;
    }
  }
  return 1;
}

/**
 * The highest-weighted valid tag in an `Accept-Language` header (or in a
 * space-separated `ui_locales` list, whose entries carry no weight and so all
 * score 1).
 *
 * Header order is not preference order: "de;q=0.5, en-GB;q=0.9" asks for
 * British English first. Weights are compared strictly, so equal priorities
 * keep the order the header already expresses. `q=0` means "not acceptable"
 * (RFC 9110 §12.5.4) and is skipped rather than selected. This mirrors the
 * quality handling in `detectLanguage`.
 */
function bestValidTag(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let best: { tag: string; q: number } | undefined;
  for (const entry of value.split(",")) {
    const [rawTags, ...params] = entry.split(";");
    const q = parseQuality(params);
    if (q <= 0) continue;
    for (const tag of (rawTags ?? "").trim().split(/\s+/)) {
      if (!tag || !BCP47.test(tag)) continue;
      if (!best || q > best.q) best = { tag, q };
    }
  }
  return best?.tag;
}

/**
 * Resolve the locale used for formatting, keeping the region subtag.
 *
 * Priority mirrors `detectLanguage`: the OAuth request's `ui_locales` (which
 * the application sets explicitly, and is therefore the closest thing to a
 * per-tenant choice today) wins over the browser's `Accept-Language`.
 */
export function resolveLocale(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
): string {
  return bestValidTag(uiLocales) ?? bestValidTag(acceptLanguage) ?? "en";
}

/**
 * Resolve the locale from a Hono context, using the request's
 * `Accept-Language` header and an optional explicit `ui_locales`.
 */
export function resolveLocaleFromContext(
  ctx: { req: { header: (name: string) => string | undefined } },
  uiLocales?: string,
): string {
  return resolveLocale(uiLocales, ctx.req.header("Accept-Language"));
}
