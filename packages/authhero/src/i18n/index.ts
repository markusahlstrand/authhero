/**
 * Paraglide i18n with custom text override support
 *
 * This module provides:
 * 1. Type-safe access to Paraglide messages via `m`
 * 2. Runtime overrides from the database (custom text)
 * 3. Request-scoped locale context (no global mutable state)
 *
 * Usage:
 * ```typescript
 * import { createTranslation } from '../i18n';
 *
 * // Create request-scoped translation at start of request
 * const { m, locale } = createTranslation('nb', customTextFromDb);
 *
 * // Use translations - fully typed!
 * m.welcome()  // "Velkommen" (or custom override if set)
 * m.continue_with({ provider: 'Google' })  // "Fortsett med Google"
 * ```
 */

import * as originalMessages from "../paraglide/messages.js";
import { overwriteGetLocale, locales, baseLocale } from "../paraglide/runtime.js";
import type { CustomText } from "@authhero/adapter-interfaces";

// Re-export Locale type
export type Locale = (typeof locales)[number];

// Type for the messages object
export type Messages = typeof originalMessages;

/**
 * Substitute variables in a string
 * Supports ${var}, #{var}, and {var} syntax
 */
function substituteVariables(
  text: string,
  variables?: Record<string, unknown>,
): string {
  if (!variables) return text;

  let result = text;
  for (const [varName, varValue] of Object.entries(variables)) {
    if (varValue !== undefined) {
      // Escape regex special chars in variable name
      const escapedVarName = varName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Support ${var}, #{var}, and {var} syntax
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
 * Normalize a locale string to a supported locale
 */
function normalizeLocale(locale: string): Locale {
  const normalized = locale.split("-")[0]?.toLowerCase() || baseLocale;
  return locales.includes(normalized as Locale)
    ? (normalized as Locale)
    : baseLocale;
}

/**
 * Convert custom text to overrides map
 */
function buildOverrides(
  customText?: CustomText,
  promptScreen?: string,
): Record<string, string> {
  const overrides: Record<string, string> = {};
  if (!customText) return overrides;

  // Normalize prompt screen to snake_case for key prefix
  const promptPrefix = promptScreen
    ? promptScreen.replace(/-/g, "_").toLowerCase() + "_"
    : "";

  for (const [key, value] of Object.entries(customText)) {
    if (typeof value === "string") {
      // Convert camelCase/kebab-case to snake_case to match Paraglide keys
      const snakeKey = key
        .replace(/([A-Z])/g, "_$1")
        .replace(/-/g, "_")
        .toLowerCase()
        .replace(/^_/, "");

      // Store with prompt prefix (e.g., "login_id_title")
      const prefixedKey = promptPrefix + snakeKey;
      overrides[prefixedKey] = value;

      // Also store without prefix as fallback for generic keys
      overrides[snakeKey] = value;
    }
  }

  return overrides;
}

/**
 * Create wrapper functions for messages that check for custom text overrides
 * Returns a request-scoped messages object
 */
function createMessageWrappers(
  locale: Locale,
  overrides: Record<string, string>,
): Messages {
  // Set the Paraglide locale for this context
  overwriteGetLocale(() => locale);

  const wrappers: Record<
    string,
    (variables?: Record<string, unknown>) => string
  > = {};

  for (const [key, originalFn] of Object.entries(originalMessages)) {
    if (typeof originalFn === "function") {
      wrappers[key] = (variables?: Record<string, unknown>) => {
        // Check for custom override first
        const override = overrides[key];
        if (override !== undefined) {
          return substituteVariables(override, variables);
        }

        // Call the original Paraglide function
        return (originalFn as (vars?: Record<string, unknown>) => string)(
          variables,
        );
      };
    } else {
      // Non-function properties (if any) are passed through
      wrappers[key] = originalFn as unknown as (
        variables?: Record<string, unknown>,
      ) => string;
    }
  }

  return wrappers as unknown as Messages;
}

/**
 * Translation context returned by createTranslation
 */
export interface TranslationContext {
  /** The resolved locale */
  locale: Locale;
  /** Type-safe message functions with custom text override support */
  m: Messages;
}

/**
 * Create a request-scoped translation context
 *
 * This function creates a new translation context for each request,
 * avoiding global mutable state that would cause race conditions
 * in concurrent serverless environments.
 *
 * @param locale - The locale code (e.g., 'nb', 'en', 'sv')
 * @param customText - Optional custom text overrides from database
 * @param promptScreen - Optional prompt screen ID for namespacing (e.g., 'login-id', 'signup')
 * @returns TranslationContext with locale and typed message functions
 */
export function createTranslation(
  locale: string,
  customText?: CustomText,
  promptScreen?: string,
): TranslationContext {
  const validLocale = normalizeLocale(locale);
  const overrides = buildOverrides(customText, promptScreen);
  const m = createMessageWrappers(validLocale, overrides);

  return {
    locale: validLocale,
    m,
  };
}

/**
 * Check if a locale is supported
 */
export function isLocaleSupported(locale: string): boolean {
  const normalized = locale.split("-")[0]?.toLowerCase();
  return locales.includes(normalized as Locale);
}

// Re-export for convenience
export { locales, baseLocale } from "../paraglide/runtime.js";
