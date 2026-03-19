function parseHex(hex: string): [number, number, number] {
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function toHex(r: number, g: number, b: number): string {
  const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  return `#${hex}`;
}

export const lighten = (hex: string, percent: number): string => {
  const [r, g, b] = parseHex(hex);
  return toHex(
    Math.min(255, Math.round(r + (255 - r) * percent)),
    Math.min(255, Math.round(g + (255 - g) * percent)),
    Math.min(255, Math.round(b + (255 - b) * percent)),
  );
};

export const darken = (hex: string, percent: number): string => {
  const [r, g, b] = parseHex(hex);
  return toHex(
    Math.max(0, Math.round(r * (1 - percent))),
    Math.max(0, Math.round(g * (1 - percent))),
    Math.max(0, Math.round(b * (1 - percent))),
  );
};

/**
 * WCAG relative luminance (0 = black, 1 = white)
 */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * WCAG contrast ratio between two colors (1–21)
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Returns "#ffffff" or "#000000" based on which has better contrast
 * against the given background color.
 *
 * In light mode, white text is slightly favored for borderline colors
 * (e.g. pure red gets white text). In dark mode, black text is favored.
 */
export function getContrastTextColor(
  backgroundHex: string,
  mode: "light" | "dark" = "light",
): string {
  const whiteContrast = contrastRatio(backgroundHex, "#ffffff");
  const blackContrast = contrastRatio(backgroundHex, "#000000");

  const BIAS = 1.35;
  if (mode === "light") {
    return blackContrast > whiteContrast * BIAS ? "#000000" : "#ffffff";
  }
  return blackContrast * BIAS > whiteContrast ? "#000000" : "#ffffff";
}

/**
 * Adjusts a color to ensure it meets WCAG AA contrast (4.5:1)
 * against the given background. Darkens or lightens in steps.
 */
export function ensureContrast(
  foregroundHex: string,
  backgroundHex: string,
  minRatio = 4.5,
): string {
  if (contrastRatio(foregroundHex, backgroundHex) >= minRatio) {
    return foregroundHex;
  }

  const blackContrast = contrastRatio("#000000", backgroundHex);
  const whiteContrast = contrastRatio("#ffffff", backgroundHex);
  const shouldDarken = blackContrast > whiteContrast;
  let adjusted = foregroundHex;

  for (let i = 1; i <= 10; i++) {
    adjusted = shouldDarken
      ? darken(foregroundHex, i * 0.1)
      : lighten(foregroundHex, i * 0.1);
    if (contrastRatio(adjusted, backgroundHex) >= minRatio) {
      return adjusted;
    }
  }

  // Fallback to whichever of black/white has higher contrast
  return blackContrast > whiteContrast ? "#000000" : "#ffffff";
}
