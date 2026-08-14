/**
 * Locale and language resolution for the universal login pages and emails.
 *
 * Two related but distinct outputs:
 *
 * - `resolveLanguage` reduces to a language subtag ("en-GB" -> "en"), which is
 *   the right key for a translation catalogue.
 * - `resolveLocale` keeps the full tag — the region is what decides whether a
 *   date reads DD/MM/YYYY or MM/DD/YYYY.
 *
 * Both honour the tenant's `enabled_locales` the way Auth0 does: when set it
 * is both a restriction (requested languages outside the list are ignored)
 * and a default (its first entry wins when nothing requested matches).
 */

/** A conservative BCP-47 shape: language, optional script, optional region. */
const BCP47 = /^[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?$/i;

const DEFAULT_LANGUAGE = "en";

/** The language subtag of a BCP-47 tag, lowercased ("nb-NO" -> "nb"). */
function languageSubtag(tag: string): string {
  return tag.split("-")[0]!.toLowerCase();
}

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
 * All valid tags in an `Accept-Language` header (or a space-separated
 * `ui_locales` list, whose entries carry no weight and so all score 1),
 * ordered best first.
 *
 * Header order is not preference order: "de;q=0.5, en-GB;q=0.9" asks for
 * British English first. The sort is stable, so equal priorities keep the
 * order the header already expresses. `q=0` means "not acceptable"
 * (RFC 9110 §12.5.4) and is skipped rather than ranked.
 */
function orderedValidTags(value: string | undefined): string[] {
  if (!value) return [];
  const weighted: { tag: string; q: number }[] = [];
  for (const entry of value.split(",")) {
    const [rawTags, ...params] = entry.split(";");
    const q = parseQuality(params);
    if (q <= 0) continue;
    for (const tag of (rawTags ?? "").trim().split(/\s+/)) {
      if (!tag || !BCP47.test(tag)) continue;
      weighted.push({ tag, q });
    }
  }
  return weighted.sort((a, b) => b.q - a.q).map((w) => w.tag);
}

/**
 * Whether a tag's language matches one of the tenant's enabled locales.
 * Comparison is on the language subtag, so a request for "nb-NO" satisfies
 * an enabled locale of "nb" (and vice versa).
 */
function matchesEnabledLocales(tag: string, enabledLocales: string[]): boolean {
  const lang = languageSubtag(tag);
  return enabledLocales.some((locale) => languageSubtag(locale) === lang);
}

/**
 * Resolve the locale used for formatting, keeping the region subtag.
 *
 * Priority: the OAuth request's `ui_locales` (which the application sets
 * explicitly) wins over the browser's `Accept-Language`. When the tenant
 * restricts languages via `enabled_locales`, candidates outside the list are
 * skipped and the first enabled locale is the fallback instead of "en".
 */
export function resolveLocale(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
  enabledLocales?: string[],
): string {
  const candidates = [
    ...orderedValidTags(uiLocales),
    ...orderedValidTags(acceptLanguage),
  ];
  if (!enabledLocales?.length) {
    return candidates[0] ?? DEFAULT_LANGUAGE;
  }
  return (
    candidates.find((tag) => matchesEnabledLocales(tag, enabledLocales)) ??
    enabledLocales[0] ??
    DEFAULT_LANGUAGE
  );
}

/**
 * Resolve the language used to pick translations: the language subtag of the
 * same tag `resolveLocale` would choose.
 */
export function resolveLanguage(
  uiLocales: string | undefined,
  acceptLanguage: string | undefined,
  enabledLocales?: string[],
): string {
  return languageSubtag(
    resolveLocale(uiLocales, acceptLanguage, enabledLocales),
  );
}

/**
 * Resolve a single already-chosen language (e.g. one threaded into an email
 * sender) against the tenant's `enabled_locales`: keep it when it is enabled
 * (or no restriction is configured), otherwise fall back to the tenant's
 * first enabled locale. Always returns a language subtag.
 */
export function resolveTenantLanguage(
  language: string | undefined,
  enabledLocales?: string[],
): string {
  if (!enabledLocales?.length) {
    return language ? languageSubtag(language) : DEFAULT_LANGUAGE;
  }
  if (language && matchesEnabledLocales(language, enabledLocales)) {
    return languageSubtag(language);
  }
  return languageSubtag(enabledLocales[0]!);
}

/**
 * Resolve the locale from a Hono context, using the request's
 * `Accept-Language` header and an optional explicit `ui_locales`.
 */
export function resolveLocaleFromContext(
  ctx: { req: { header: (name: string) => string | undefined } },
  uiLocales?: string,
  enabledLocales?: string[],
): string {
  return resolveLocale(
    uiLocales,
    ctx.req.header("Accept-Language"),
    enabledLocales,
  );
}
