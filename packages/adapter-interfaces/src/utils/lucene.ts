/**
 * Shared pieces of the Lucene-style `q` filter handling. The SQL generation
 * itself is ORM-specific and lives in each adapter; what is shared here is
 * the query-string sanitization that enforces the tenant boundary.
 */

// Strip field-scoped clauses (`field:value`, `-field:value`, `_exists_:field`,
// `field=value`) whose field is not in `allowedFields`. Bare-string tokens are
// preserved (the adapters' lucene filters route them through their own
// searchable-columns whitelist). Returns a query string safe to pass into the
// adapter's lucene filter.
//
// Both adapters share this so they get the same tenant-boundary protection:
// without it a clause like `q=tenant_id:other` would emit SQL against
// arbitrary columns.
export function sanitizeLuceneQuery(
  query: string,
  allowedFields: string[],
): string {
  const allowed = new Set(allowedFields);

  const sanitizePart = (part: string): string => {
    const tokens: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < part.length; i++) {
      const char = part[i];
      if (char === '"') {
        inQuotes = !inQuotes;
        current += char;
      } else if (char === " " && !inQuotes) {
        if (current.trim()) tokens.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    if (current.trim()) tokens.push(current.trim());

    const kept = tokens.filter((token) => {
      const normalized = token.replace(/^([^:]+)=/, "$1:");
      const stripped = normalized.startsWith("-")
        ? normalized.slice(1)
        : normalized;

      if (stripped.startsWith("_exists_:")) {
        return allowed.has(stripped.slice(9));
      }
      const colonIdx = stripped.indexOf(":");
      if (colonIdx > 0) {
        return allowed.has(stripped.slice(0, colonIdx));
      }
      return true;
    });

    return kept.join(" ");
  };

  const orParts = query.split(/ OR /i);
  if (orParts.length > 1) {
    return orParts
      .map(sanitizePart)
      .filter((p) => p.length > 0)
      .join(" OR ");
  }
  return sanitizePart(query);
}
