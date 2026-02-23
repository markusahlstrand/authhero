/**
 * Build-time cache-busting hash for static assets.
 *
 * Vite replaces `process.env.AUTHHERO_BUILD_HASH` at build time with a
 * unique string literal per build. During dev/tsc it falls back to "dev".
 */
export const buildHash: string =
  process.env.AUTHHERO_BUILD_HASH || "dev";
