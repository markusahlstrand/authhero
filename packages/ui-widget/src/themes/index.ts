/**
 * AuthHero Widget - Theming System
 *
 * The widget supports theming via branding/theme props from AuthHero API,
 * CSS custom properties, or CSS classes for quick prototyping.
 *
 * ## 1. Branding & Theme Props (Recommended)
 *
 * Pass AuthHero branding and theme configuration directly:
 *
 * ```html
 * <authhero-widget
 *   branding='{"colors":{"primary":"#7D68F4"},"logo_url":"..."}'
 *   theme='{"borders":{"widget_corner_radius":16}}'
 * ></authhero-widget>
 * ```
 *
 * ## 2. CSS Custom Properties
 *
 * Override individual variables:
 *
 * ```css
 * authhero-widget {
 *   --ah-color-primary: #7D68F4;
 *   --ah-widget-radius: 16px;
 * }
 * ```
 *
 * ## 3. Theme Preset Classes
 *
 * Quick styling via CSS classes (for demos/prototyping):
 *
 * ```html
 * <authhero-widget class="ah-theme-dark"></authhero-widget>
 * ```
 */

// Re-export branding utilities
export {
  brandingToCssVars,
  themeToCssVars,
  mergeThemeVars,
  applyCssVars,
} from '../utils/branding';

export type { WidgetBranding, WidgetTheme } from '../utils/branding';

// Theme preset class names
export const themePresets = ['ah-theme-minimal', 'ah-theme-rounded', 'ah-theme-dark'] as const;

// CSS part names for ::part() styling
export const cssParts = [
  'container',
  'logo',
  'title',
  'form',
  'links',
  'link',
  'link-wrapper',
  'divider',
  'divider-text',
  'message',
  'message-error',
  'message-success',
  'input-wrapper',
  'label',
  'input',
  'helper-text',
  'error-text',
  'button',
  'button-primary',
  'button-secondary',
  'checkbox-wrapper',
  'checkbox',
  'checkbox-label',
  'image',
  'text-title',
  'text-description',
  'text-error',
  'text-success',
] as const;
