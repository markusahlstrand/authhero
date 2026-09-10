/**
 * Dark-mode CSS variables and the contrast maths behind them.
 *
 * Pure functions, moved out of the authhero page module so the widget demo
 * renders the same dark mode the real login page does.
 */

export const DARK_MODE_CSS_VARS: Record<string, string> = {
  "--ah-color-text": "#f9fafb",
  "--ah-color-text-muted": "#9ca3af",
  "--ah-color-text-label": "#d1d5db",
  // Header is read by the widget as `--ah-color-text-header` first, falling
  // back to the legacy `--ah-color-header`. Set both so an applied theme's
  // `header` color (e.g. DEFAULT_THEME's #000000) can't leave the title black.
  "--ah-color-text-header": "#f9fafb",
  "--ah-color-header": "#f9fafb",
  "--ah-color-bg": "#1f2937",
  "--ah-color-bg-hover": "#374151",
  "--ah-color-bg-muted": "#374151",
  "--ah-color-bg-disabled": "#4b5563",
  "--ah-color-input-bg": "#374151",
  // Typed input text and secondary-button label are also driven by the theme
  // (input_filled_text / secondary_button_label) and default to #000000, which
  // is unreadable on the dark input/widget surfaces above.
  "--ah-color-input-text": "#f9fafb",
  "--ah-btn-secondary-text": "#f9fafb",
  "--ah-color-border": "#4b5563",
  "--ah-color-border-hover": "#6b7280",
  "--ah-color-border-muted": "#374151",
  "--ah-color-error-bg": "rgba(220,38,38,0.2)",
  "--ah-color-success-bg": "rgba(22,163,74,0.2)",
  "--ah-color-link": "#60a5fa",
};

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function parseDarkHex(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  const n = parseInt(c, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function darkLuminance(hex: string): number {
  const [r, g, b] = parseDarkHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
export function darkContrastRatio(h1: string, h2: string): number {
  const l1 = darkLuminance(h1);
  const l2 = darkLuminance(h2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export function lightenHexDark(hex: string, pct: number): string {
  const [r, g, b] = parseDarkHex(hex);
  const f = (v: number) =>
    Math.min(255, Math.round(v + (255 - v) * pct))
      .toString(16)
      .padStart(2, "0");
  return `#${f(r)}${f(g)}${f(b)}`;
}
export function darkModeCssVarRules(
  selector: string,
  primaryColor?: string,
): string {
  const vars: Record<string, string> = { ...DARK_MODE_CSS_VARS };
  if (primaryColor) {
    const darkBg = DARK_MODE_CSS_VARS["--ah-color-bg"] || "#1f2937";
    if (darkContrastRatio(primaryColor, darkBg) < 3) {
      let adjusted = primaryColor;
      for (let i = 1; i <= 10; i++) {
        adjusted = lightenHexDark(primaryColor, i * 0.1);
        if (darkContrastRatio(adjusted, darkBg) >= 3) break;
      }
      vars["--ah-color-primary"] = adjusted;
      vars["--ah-color-primary-hover"] = adjusted;
    }
    const BIAS = 1.35;
    const btnBg = vars["--ah-color-primary"] || primaryColor;
    const whiteContrast = darkContrastRatio(btnBg, "#ffffff");
    const blackContrast = darkContrastRatio(btnBg, "#000000");
    vars["--ah-color-text-on-primary"] =
      blackContrast > whiteContrast * BIAS ? "#000000" : "#ffffff";
  }
  const props = Object.entries(vars)
    .map(([k, v]) => `${k}: ${v} !important`)
    .join("; ");
  return `${selector} { ${props}; }`;
}
