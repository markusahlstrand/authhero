/**
 * Sanitize a string for use in CSS class names and part tokens.
 * Replaces spaces and special characters with hyphens, converts to lowercase.
 * authhero-node and authhero-widget must agree on this so exported parts
 * match the ones the node renders.
 */
export function sanitizeForCssToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric chars with hyphen
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
}
