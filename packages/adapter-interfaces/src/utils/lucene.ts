/**
 * Shared pieces of the Lucene-style `q` filter handling. The SQL generation
 * itself is ORM-specific and lives in each adapter; what is shared here is
 * the tokenizer (including the OR split) and the query-string sanitization
 * that enforces the tenant boundary.
 */

// Split a query into tokens on unquoted whitespace. Quote characters are kept
// in the token so the caller can tell `field:"a b"` from `field:a b` and strip
// the quotes itself; an unterminated quote swallows the rest of the query,
// which keeps a crafted value in a single token rather than letting it break
// out into query syntax.
//
// A backslash-escaped quote (`\"`, as produced by `escapeLuceneValue`) is part
// of the value and does not end the quoted run — otherwise an escaped value
// could still close its own quoting and inject clauses after it.
export function tokenizeLuceneQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < query.length; i++) {
    const char = query[i];

    if (char === "\\" && i + 1 < query.length) {
      // Keep the escape sequence intact; value-level unescaping happens once
      // the field's value has been extracted.
      current += char + query[i + 1];
      i++;
    } else if (char === '"') {
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

  return tokens;
}

// Reverse Lucene escaping on a value operand: a backslash followed by a Lucene
// reserved character is a literal of that character (e.g. `auth0|abc\-123` ->
// `auth0|abc-123`). Clients (such as the admin UI) escape filter values per
// Lucene rules before interpolating them into the query string, so without
// this the backslash leaks into the SQL comparison and exact matches never hit.
export function unescapeLuceneValue(value: string): string {
  return value.replace(/\\([\\"+\-!(){}[\]^~*?:/&|])/g, "$1");
}

// Escape a value so it can be interpolated into a `q` filter as a single
// literal, and wrap it in quotes so whitespace stays inside the value.
//
// Server-side callers that select rows by a caller-controlled value (a user id,
// say) must use this rather than interpolating raw: an unquoted value carrying
// ` OR ` is genuinely two clauses and would widen the match. Escaping the
// backslash and the quote is what makes the quoting airtight — the tokenizer
// above ignores `\"`, and the adapters unescape the value again once the clause
// has been split off.
export function escapeLuceneValue(value: string): string {
  return `"${value.replace(/([\\"])/g, "\\$1")}"`;
}

// The inverse of `escapeLuceneValue`: strip one layer of surrounding quotes
// from a clause operand and reverse the escaping. Adapters that pick a value
// out of `q` without going through the full filter (the user_organizations
// lists, which only ever support one exact clause) use this so a quoted value
// compares as its unquoted self.
export function unquoteLuceneValue(value: string): string {
  const trimmed = value.trim();
  const inner =
    trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1)
      : trimmed;
  return unescapeLuceneValue(inner);
}

// Tokenize and then split on the OR operator, returning one token group per
// disjunct (tokens within a group are conjoined, Lucene's implicit AND).
//
// The split has to run on tokens, not on the raw string: splitting the string
// on / OR /i first means quoting a value does not contain it, so a value like
// `attacker OR user_id:victim OR x` interpolated into `user_id:"…"` yields a
// clean middle clause that matches another user's rows. As a token the whole
// quoted value stays together and can only ever be compared as a literal.
//
// Empty groups (a leading, trailing or doubled OR) are dropped, so a query
// with a single meaningful group takes the plain conjunction path.
export function splitLuceneOrGroups(query: string): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const token of tokenizeLuceneQuery(query)) {
    // Lucene spells its operators uppercase, but the previous string split was
    // case-insensitive and callers rely on it, so `or` separates too. A quoted
    // `"OR"` keeps its quotes in the token and is therefore never an operator.
    if (/^or$/i.test(token)) {
      groups.push(current);
      current = [];
    } else {
      current.push(token);
    }
  }
  groups.push(current);

  return groups.filter((group) => group.length > 0);
}

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

  const isAllowedToken = (token: string): boolean => {
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
  };

  // Tokenizing before the OR split matters here too: without it the field of a
  // quoted value that contains ` OR ` would be checked against the whitelist
  // as if it were a clause of its own.
  return splitLuceneOrGroups(query)
    .map((group) => group.filter(isAllowedToken).join(" "))
    .filter((part) => part.length > 0)
    .join(" OR ");
}

// A bare (unscoped) `q` token that is unambiguously a full email address.
//
// Free-text search normally emits `LIKE '%token%'` across every searchable
// column, and a leading wildcard is unindexable: on a large tenant every user
// row has to be read and string-compared, twice when `include_totals=true`.
// An email address can only ever be an email, so adapters resolve such a token
// with an equality comparison against the email column alone, which the
// (email, provider, tenant_id) unique index serves as a seek.
//
// Deliberately strict — anything carrying whitespace, a LIKE wildcard or a
// Lucene operator falls back to the substring search, so partial searches
// ("@gmail.com", "harald") keep behaving as before.
const EMAIL_SEARCH_TERM =
  /^[^\s@%_*?"'()[\]{}^~:\\/]+@[^\s@%_*?"'()[\]{}^~:\\/]+\.[^\s@%_*?"'()[\]{}^~:\\/]+$/;

export function isEmailSearchTerm(value: string): boolean {
  return EMAIL_SEARCH_TERM.test(value);
}
