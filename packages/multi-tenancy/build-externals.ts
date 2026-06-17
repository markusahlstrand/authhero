/**
 * Packages that must NOT be bundled into the package output. They are provided
 * by the host app as peer dependencies so there is a single shared instance at
 * runtime.
 *
 * This matters most for `hono`: bundling a second copy means the HTTPException
 * class thrown by our routes is not the same class the host app's error handler
 * checks with `instanceof`, so legitimate 401/403/404s leak out as generic
 * 500s.
 */
export const externalPackages = [
  "@hono/zod-openapi",
  "hono",
  "zod",
  "authhero",
  "@authhero/adapter-interfaces",
];

/**
 * True if an import id should be left external. Matches both the bare package
 * name and any subpath export (e.g. "hono/http-exception") — Rollup's default
 * `external` array does exact string matching, so subpaths would otherwise be
 * inlined.
 */
export function isExternalDependency(id: string): boolean {
  return externalPackages.some((pkg) => id === pkg || id.startsWith(`${pkg}/`));
}
