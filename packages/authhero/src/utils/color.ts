/**
 * Lightens a hex color by a given percentage
 * @param hex - The hex color string (e.g., "#7d68f4" or "7d68f4")
 * @param percent - The percentage to lighten (0.2 = 20%)
 * @returns The lightened hex color
 */
export const lighten = (hex: string, percent: number): string => {
  // Remove # if present
  const cleanHex = hex.replace("#", "");

  // Parse RGB values
  const num = parseInt(cleanHex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  // Calculate lightened values
  const newR = Math.min(255, Math.round(r + (255 - r) * percent));
  const newG = Math.min(255, Math.round(g + (255 - g) * percent));
  const newB = Math.min(255, Math.round(b + (255 - b) * percent));

  // Convert back to hex
  const newHex = ((newR << 16) | (newG << 8) | newB)
    .toString(16)
    .padStart(6, "0");
  return `#${newHex}`;
};
