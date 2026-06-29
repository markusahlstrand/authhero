/**
 * Regression test for the dark-mode "black text on black background" bug.
 *
 * DEFAULT_THEME is applied unconditionally when a tenant has no stored theme.
 * Its Auth0-style colors are light-mode only (`header`, `input_filled_text`,
 * `secondary_button_label` default to #000000), and the widget sets them as
 * inline CSS vars. The dark-mode palette must override every one of those vars
 * — by the exact name the widget reads — or the corresponding text renders
 * black on the dark widget surface.
 *
 * The original break: the dark palette set the legacy `--ah-color-header` while
 * the widget reads `--ah-color-text-header` first, and had no override at all
 * for `--ah-color-input-text` / `--ah-btn-secondary-text`.
 */
import { describe, it, expect } from "vitest";
import { buildHeadEssentials } from "../../src/routes/universal-login/u2-widget-page";
import { DEFAULT_THEME } from "../../src/constants/defaultTheme";

// Vars the widget reads for foreground text, paired with the DEFAULT_THEME
// color that would otherwise paint them black. If DEFAULT_THEME grows a new
// black foreground color, add its var here so dark mode is forced to cover it.
const BLACK_DEFAULT = "#000000";
const TEXT_VARS: { cssVar: string; themeColor: string | undefined }[] = [
  { cssVar: "--ah-color-text", themeColor: DEFAULT_THEME.colors?.body_text },
  { cssVar: "--ah-color-text-header", themeColor: DEFAULT_THEME.colors?.header },
  {
    cssVar: "--ah-color-input-text",
    themeColor: DEFAULT_THEME.colors?.input_filled_text,
  },
  {
    cssVar: "--ah-btn-secondary-text",
    themeColor: DEFAULT_THEME.colors?.secondary_button_label,
  },
];

describe("dark mode vs DEFAULT_THEME color defaults", () => {
  const head = buildHeadEssentials({
    clientName: "Test",
    theme: DEFAULT_THEME,
  });

  it("guards the assumption that these defaults are actually black", () => {
    // If these stop being black the test's premise is moot — make that loud
    // rather than letting the override assertions pass vacuously.
    for (const { cssVar, themeColor } of TEXT_VARS) {
      expect(
        themeColor?.toUpperCase(),
        `${cssVar} maps to a DEFAULT_THEME color`,
      ).toBe(BLACK_DEFAULT);
    }
  });

  it.each(TEXT_VARS)(
    "overrides $cssVar to a non-black value in dark mode",
    ({ cssVar }) => {
      // Every foreground var the theme paints black must be reassigned by the
      // dark palette (emitted both as `!important` CSS rules and in the dark
      // runtime vars JSON inside the head).
      const match = head.match(
        new RegExp(`${cssVar}\\s*:\\s*(#[0-9a-fA-F]{3,8})`),
      );
      expect(match, `${cssVar} has a dark-mode override`).not.toBeNull();
      expect(
        match![1].toUpperCase(),
        `${cssVar} dark override must not be black`,
      ).not.toBe(BLACK_DEFAULT);
    },
  );
});
