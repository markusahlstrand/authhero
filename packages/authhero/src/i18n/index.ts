/**
 * Paraglide i18n with custom text override support
 *
 * This module provides:
 * 1. Type-safe access to Paraglide messages via proxied `m`
 * 2. Runtime overrides from the database (custom text)
 * 3. Per-request locale context
 *
 * Usage:
 * ```typescript
 * import { initTranslation, m } from '../i18n';
 *
 * // Initialize at start of request with locale and optional custom text
 * initTranslation('nb', customTextFromDb);
 *
 * // Use translations - fully typed!
 * m.welcome()  // "Velkommen" (or custom override if set)
 * m.continue_with({ provider: 'Google' })  // "Fortsett med Google"
 * ```
 */

import * as originalMessages from "../paraglide/messages.js";
import {
  overwriteGetLocale,
  locales,
  baseLocale,
} from "../paraglide/runtime.js";
import type { CustomText } from "@authhero/adapter-interfaces";

// Re-export Locale type
export type Locale = (typeof locales)[number];

/**
 * Current request context
 */
interface TranslationContext {
  locale: Locale;
  overrides: Record<string, string>;
}

let currentContext: TranslationContext = {
  locale: baseLocale,
  overrides: {},
};

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
 * Create wrapper functions for messages that check for custom text overrides
 * We can't use Proxy because Paraglide's bundled functions are non-configurable
 */
function createMessageWrappers(): typeof originalMessages {
  const wrappers: Record<string, (variables?: Record<string, unknown>) => string> = {};
  
  for (const [key, originalFn] of Object.entries(originalMessages)) {
    if (typeof originalFn === "function") {
      wrappers[key] = (variables?: Record<string, unknown>) => {
        // Check for custom override
        const override = currentContext.overrides[key];
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
      wrappers[key] = originalFn as any;
    }
  }
  
  return wrappers as unknown as typeof originalMessages;
}

/**
 * The wrapped messages object - use this for type-safe translations
 * that automatically check custom text overrides
 */
export const m = createMessageWrappers();

/**
 * Initialize translation context for a request
 *
 * @param locale - The locale code (e.g., 'nb', 'en', 'sv')
 * @param customText - Optional custom text overrides from database
 * @param promptScreen - Optional prompt screen ID for namespacing (e.g., 'login-id', 'signup')
 */
export function initTranslation(
  locale: string,
  customText?: CustomText,
  promptScreen?: string,
): void {
  // Normalize and validate locale
  const normalizedLocale = locale.split("-")[0]?.toLowerCase() || baseLocale;
  const validLocale = locales.includes(normalizedLocale as Locale)
    ? (normalizedLocale as Locale)
    : baseLocale;

  // Convert custom text to overrides map
  const overrides: Record<string, string> = {};
  if (customText) {
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
  }

  currentContext = {
    locale: validLocale,
    overrides,
  };

  // Update Paraglide's locale getter
  overwriteGetLocale(() => currentContext.locale);
}

/**
 * Get the current locale
 */
export function getCurrentLocale(): Locale {
  return currentContext.locale;
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
