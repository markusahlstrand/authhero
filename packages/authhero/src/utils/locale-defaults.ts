/**
 * Locale defaults for prompt custom text.
 *
 * Loads Auth0-format locale JSON files at build time (via Vite's import.meta.glob)
 * and provides a function to retrieve defaults for a given prompt and language.
 */

// Import Auth0-format locale files at build time
const localeModules = import.meta.glob("../../locales/*.json", {
  eager: true,
}) as Record<
  string,
  { default: Record<string, Record<string, Record<string, string>>> }
>;

// Build a map of locale → full Auth0-format data
const LOCALE_DATA: Record<
  string,
  Record<string, Record<string, Record<string, string>>>
> = {};

for (const [path, mod] of Object.entries(localeModules)) {
  const locale = path.match(/\/(\w+)\.json$/)?.[1];
  if (locale) {
    LOCALE_DATA[locale] = mod.default || (mod as any);
  }
}

/**
 * Get locale defaults for a specific prompt and language.
 *
 * Returns the nested screen → key → value structure for the given prompt,
 * falling back to English if the requested language isn't available.
 *
 * @param prompt - The prompt screen ID (e.g., "login-id", "signup")
 * @param language - The language code (e.g., "en", "sv")
 * @returns The default custom text for the prompt, or empty object if not found
 */
export function getLocaleDefaults(
  prompt: string,
  language: string,
): Record<string, Record<string, string>> {
  const baseLang = language.split("-")[0] || "en";

  return (
    LOCALE_DATA[baseLang]?.[prompt] ??
    LOCALE_DATA["en"]?.[prompt] ??
    {}
  );
}
