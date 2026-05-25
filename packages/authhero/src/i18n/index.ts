/**
 * i18n with custom text override support
 *
 * Loads Auth0-format locale JSON files at build time and provides
 * screen-scoped translation functions.
 *
 * Usage:
 * ```typescript
 * import { createTranslation } from '../i18n';
 *
 * const { m } = createTranslation('login-id', 'login-id', 'nb', customTextFromDb);
 * m.title()  // "Velkommen" (or custom override if set)
 * m.description({ companyName: 'Acme', clientName: 'App' })
 * ```
 */

import { z } from "@hono/zod-openapi";
import type { CustomText } from "@authhero/adapter-interfaces";
import type { ScreenMap } from "../generated/locale-types";

export type { ScreenMap } from "../generated/locale-types";
export type { Locale } from "../generated/locale-types";

export type TranslationMap = Record<
  string,
  (variables?: Record<string, unknown>) => string
>;

export const locales = [
  "cs",
  "da",
  "en",
  "fi",
  "it",
  "nb",
  "pl",
  "sv",
] as const;
export const baseLocale = "en" as const;

/**
 * Native display names for each supported locale. Used by the language picker
 * in the universal-login chrome. Keys must stay in sync with `locales` above —
 * adding a locale here without a JSON file (or vice versa) will leave the
 * picker showing a raw code instead of a name.
 */
export const LOCALE_DISPLAY_NAMES: Record<(typeof locales)[number], string> = {
  cs: "Čeština",
  da: "Dansk",
  en: "English",
  fi: "Suomi",
  it: "Italiano",
  nb: "Norsk",
  pl: "Polski",
  sv: "Svenska",
};

const LOCALE_DISPLAY_NAMES_LOOKUP: Record<string, string> =
  LOCALE_DISPLAY_NAMES;

/**
 * Resolve a locale code to its native display name, falling back to the
 * raw code when the locale is not recognised.
 */
export function getLocaleDisplayName(lang: string): string {
  return LOCALE_DISPLAY_NAMES_LOOKUP[lang] ?? lang;
}

// Load Auth0-format locale files at build time via Vite's import.meta.glob
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

// Build Zod schemas from English locale (source of truth) per prompt/screen
const screenSchemas: Record<string, z.ZodObject<z.ZodRawShape>> = {};
const enData = LOCALE_DATA[baseLocale];
if (enData) {
  for (const [prompt, screens] of Object.entries(enData)) {
    for (const [screen, translations] of Object.entries(screens)) {
      const shape: Record<string, z.ZodString> = {};
      for (const key of Object.keys(translations)) {
        shape[key] = z.string();
      }
      screenSchemas[`${prompt}.${screen}`] = z.object(shape);
    }
  }
}

/**
 * Substitute variables in a string.
 * Supports ${var}, #{var}, and {var} syntax.
 */
function substituteVariables(
  text: string,
  variables?: Record<string, unknown>,
): string {
  if (!variables) return text;

  let result = text;
  for (const [varName, varValue] of Object.entries(variables)) {
    if (varValue !== undefined) {
      const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result
        .replace(
          new RegExp(`\\$\\{${escapedVarName}\\}`, "g"),
          String(varValue),
        )
        .replace(new RegExp(`#\\{${escapedVarName}\\}`, "g"), String(varValue))
        .replace(new RegExp(`\\{${escapedVarName}\\}`, "g"), String(varValue));
    }
  }
  return result;
}

/**
 * Normalize a locale string to a supported locale.
 */
function normalizeLocale(locale: string): (typeof locales)[number] {
  const normalized = locale.split("-")[0]?.toLowerCase() || baseLocale;
  return locales.includes(normalized as (typeof locales)[number])
    ? (normalized as (typeof locales)[number])
    : baseLocale;
}

/**
 * Create a screen-scoped translation object.
 *
 * Returns a typed object matching the generated ScreenMap when prompt/screen
 * are known string literals, or a generic TranslationMap for dynamic keys.
 *
 * @param prompt - The prompt ID (e.g., 'login-id', 'signup')
 * @param screen - The screen ID (e.g., 'login-id', 'signup')
 * @param locale - The locale code (e.g., 'nb', 'en', 'sv')
 * @param customText - Optional custom text overrides from database
 */
export function createTranslation<P extends string, S extends string>(
  prompt: P,
  screen: S,
  locale: string,
  customText?: CustomText,
): {
  m: `${P}.${S}` extends keyof ScreenMap
    ? ScreenMap[`${P}.${S}`]
    : TranslationMap;
  locale: (typeof locales)[number];
} {
  const validLocale = normalizeLocale(locale);

  // Build defaults: start with base locale (English), overlay requested locale
  const baseDefaults = LOCALE_DATA[baseLocale]?.[prompt]?.[screen] ?? {};
  const localeDefaults = LOCALE_DATA[validLocale]?.[prompt]?.[screen] ?? {};
  const defaults = { ...baseDefaults, ...localeDefaults };

  // Get custom text overrides for this screen
  const overrides = customText?.[screen] ?? {};

  // Merge: custom text overrides take precedence over defaults
  const merged = { ...defaults, ...overrides };

  // Validate merged translations against the English schema
  const schema = screenSchemas[`${prompt}.${screen}`];
  if (schema) {
    const result = schema.safeParse(merged);
    if (!result.success) {
      console.warn(
        `[i18n] Missing translations for ${prompt}.${screen} (${validLocale}):`,
        result.error.issues.map((i) => i.path.join(".")).join(", "),
      );
    }
  }

  // Create wrapper functions for each key
  const wrappers: Record<
    string,
    (variables?: Record<string, unknown>) => string
  > = {};

  for (const [key, value] of Object.entries(merged)) {
    wrappers[key] = (variables?: Record<string, unknown>) => {
      return substituteVariables(value, variables);
    };
  }

  // Proxy returns the key name for missing translations instead of crashing
  const m = new Proxy(wrappers, {
    get: (target, prop: string) => target[prop] ?? (() => prop),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { m, locale: validLocale } as any;
}

/**
 * Check if a locale is supported.
 */
export function isLocaleSupported(locale: string): boolean {
  const normalized = locale.split("-")[0]?.toLowerCase();
  return locales.includes(normalized as (typeof locales)[number]);
}

/**
 * Get locale defaults for a specific prompt and language.
 * Used by the management API prompts endpoint.
 *
 * Returns the nested screen → key → value structure for the given prompt,
 * falling back to English if the requested language isn't available.
 */
export function getLocaleDefaults(
  prompt: string,
  language: string,
): Record<string, Record<string, string>> {
  const baseLang = language.split("-")[0] || "en";

  return LOCALE_DATA[baseLang]?.[prompt] ?? LOCALE_DATA["en"]?.[prompt] ?? {};
}

export interface LocaleDefaultsEntry {
  prompt: string;
  language: string;
  custom_text: Record<string, Record<string, string>>;
}

/**
 * Enumerate every bundled locale default as a flat list of
 * `{ prompt, language, custom_text }` entries, optionally filtered by
 * language and/or prompt. Powers the `/api/v2/prompts/custom-text/defaults`
 * endpoint so the admin UI can render placeholders and discover which
 * forms exist without round-tripping per (prompt, language) pair.
 */
export function getAllLocaleDefaults(filter?: {
  language?: string;
  prompt?: string;
}): LocaleDefaultsEntry[] {
  // LOCALE_DATA keys are lowercase (derived from `<locale>.json` filenames);
  // mirror normalizeLocale/isLocaleSupported so an input like "EN-US" matches.
  const languageFilter = filter?.language?.split("-")[0]?.toLowerCase();
  const entries: LocaleDefaultsEntry[] = [];

  for (const [language, prompts] of Object.entries(LOCALE_DATA)) {
    if (languageFilter && language !== languageFilter) continue;
    for (const [prompt, screens] of Object.entries(prompts)) {
      if (filter?.prompt && prompt !== filter.prompt) continue;
      entries.push({ prompt, language, custom_text: screens });
    }
  }

  return entries;
}
