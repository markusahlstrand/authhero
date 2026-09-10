/** Shared types for the login page chrome. */

/** Page-level dark-mode preference: follow the OS, or an explicit override. */
export type DarkModePreference = "auto" | "light" | "dark";

/** Where the tenant logo renders. */
export type LogoPosition = "widget" | "chip" | "none";

/**
 * How a corner chip renders its surface.
 * - "auto" (default): pill when there's a background image, plain text on a
 *   solid background — driven by the page-level `data-bg` attribute.
 * - "plain": always text-only, regardless of background.
 * - "pill": always a translucent pill, regardless of background.
 *
 * Templates choose this per slot via `{%- authhero:legal style="plain" -%}`.
 */
export type ChipStyle = "auto" | "plain" | "pill";

/**
 * One entry in the language picker. The label is already localized by the
 * caller — this module does no i18n of its own.
 */
export type LanguageOption = { value: string; label: string };
