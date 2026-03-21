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

export const locales = ["cs", "da", "en", "fi", "it", "nb", "pl", "sv"] as const;
export const baseLocale = "en" as const;

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
      const shape: z.ZodRawShape = {};
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
export function createTranslation<
  P extends string,
  S extends string,
>(
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

  // Get defaults: try requested locale, fall back to English
  const defaults =
    LOCALE_DATA[validLocale]?.[prompt]?.[screen] ??
    LOCALE_DATA[baseLocale]?.[prompt]?.[screen] ??
    {};

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

  return (
    LOCALE_DATA[baseLang]?.[prompt] ??
    LOCALE_DATA["en"]?.[prompt] ??
    {}
  );
}
