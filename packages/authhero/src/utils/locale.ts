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

function firstValidTag(value: string | undefined): string | undefined {
  if (!value) return undefined;
  for (const candidate of value.split(/[\s,]+/)) {
    // Drop any q-weight ("en-GB;q=0.9") before matching
    const tag = candidate.split(";")[0]?.trim();
    if (tag && BCP47.test(tag)) return tag;
  }
  return undefined;
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
  return firstValidTag(uiLocales) ?? firstValidTag(acceptLanguage) ?? "en";
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
