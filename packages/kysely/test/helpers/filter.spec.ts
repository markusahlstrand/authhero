import { describe, it, expect, vi, beforeEach } from "vitest";
import { Kysely } from "kysely";
import { Database } from "../../src/db";
import { luceneFilter, sanitizeLuceneQuery } from "../../src/helpers/filter";
import { escapeLuceneValue } from "@authhero/adapter-interfaces";

describe("luceneFilter", () => {
  // Mock Kysely instance
  const mockDb = {
    dynamic: {
      ref: vi.fn((col) => col),
    },
  } as unknown as Kysely<Database>;

  // Mock query builder. `qb` is the same object presented as the typed
  // SelectQueryBuilder that luceneFilter expects, so calls type-check without
  // `any`; assertions read `mockQb.where` to reach the underlying vi mock.
  const mockQb = {
    where: vi.fn().mockReturnThis(),
  };
  const qb = mockQb as unknown as Parameters<typeof luceneFilter>[1];

  // A minimal stand-in for Kysely's expression builder: callable (records the
  // `(field, op, value)` triples the OR branch emits) plus an `or` method.
  const makeExpressionBuilderStub = () =>
    Object.assign(vi.fn(), { or: vi.fn(), and: vi.fn() });

  const searchableColumns = ["title", "description"];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles single word search", () => {
    luceneFilter(mockDb, qb, "test", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles exact match query", () => {
    luceneFilter(mockDb, qb, "field:value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "value");
  });

  it("handles negation query", () => {
    luceneFilter(mockDb, qb, "-field:value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "!=", "value");
  });

  it("unescapes Lucene-escaped characters in quoted values", () => {
    // Clients (e.g. the admin UI) escape reserved chars before quoting, so a
    // value such as `auth0|abc-123` arrives as `auth0|abc\-123`. The dash must
    // be unescaped or the exact match never hits.
    luceneFilter(mockDb, qb, 'user_id:"auth0|abc\\-123"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("user_id", "=", "auth0|abc-123");
  });

  it("unescapes Lucene-escaped characters in unquoted values", () => {
    luceneFilter(mockDb, qb, "field:a\\-b", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "a-b");
  });

  it("handles greater than query", () => {
    luceneFilter(mockDb, qb, "field:>value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">", "value");
  });

  it("handles greater than or equal to query", () => {
    luceneFilter(mockDb, qb, "field:>=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">=", "value");
  });

  it("handles less than query", () => {
    luceneFilter(mockDb, qb, "field:<value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<", "value");
  });

  it("handles less than or equal to query", () => {
    luceneFilter(mockDb, qb, "field:<=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<=", "value");
  });

  it("handles negated greater than query", () => {
    luceneFilter(mockDb, qb, "-field:>value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<=", "value");
  });

  it("handles negated greater than or equal to query", () => {
    luceneFilter(mockDb, qb, "-field:>=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<", "value");
  });

  it("handles negated less than query", () => {
    luceneFilter(mockDb, qb, "-field:<value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">=", "value");
  });

  it("handles negated less than or equal to query", () => {
    luceneFilter(mockDb, qb, "-field:<=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">", "value");
  });

  it("handles exists query", () => {
    luceneFilter(mockDb, qb, "_exists_:field", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "is not", null);
  });

  it("handles not exists query", () => {
    luceneFilter(mockDb, qb, "-_exists_:field", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "is", null);
  });

  it("handles multiple conditions", () => {
    luceneFilter(
      mockDb,
      qb,
      "field1:value1 field2:>value2 field3:<value3",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(3);
    expect(mockQb.where).toHaveBeenCalledWith("field1", "=", "value1");
    expect(mockQb.where).toHaveBeenCalledWith("field2", ">", "value2");
    expect(mockQb.where).toHaveBeenCalledWith("field3", "<", "value3");
  });

  it("handles mixed conditions", () => {
    luceneFilter(
      mockDb,
      qb,
      "searchword field:>=value _exists_:field2",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(3);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
    expect(mockQb.where).toHaveBeenCalledWith("field", ">=", "value");
    expect(mockQb.where).toHaveBeenCalledWith("field2", "is not", null);
  });

  it("treats a literal AND token as the implicit conjunction (no extra clause)", () => {
    // Regression: without AND-handling the bare token would fall through to
    // the free-text branch and emit a `kid LIKE '%AND%' OR …` clause that
    // never matches a real signing key, breaking queries like
    // `type:jwt_signing AND -_exists_:tenant_id` used by the per-tenant
    // signing key resolver.
    luceneFilter(
      mockDb,
      qb,
      "type:jwt_signing AND -_exists_:tenant_id",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(2);
    expect(mockQb.where).toHaveBeenCalledWith("type", "=", "jwt_signing");
    expect(mockQb.where).toHaveBeenCalledWith("tenant_id", "is", null);
  });

  it('handles query with "=" instead of ":"', () => {
    luceneFilter(mockDb, qb, "field=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "value");
  });

  // Quote handling tests
  it("handles quoted values", () => {
    luceneFilter(mockDb, qb, 'email:"test@example.com"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "test@example.com");
  });

  it("handles quoted values with spaces", () => {
    luceneFilter(mockDb, qb, 'name:"John Doe"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("name", "=", "John Doe");
  });

  it("handles quoted values with special characters", () => {
    luceneFilter(
      mockDb,
      qb,
      'description:"Value with @#$% special chars"',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(
      "description",
      "=",
      "Value with @#$% special chars",
    );
  });

  it("handles empty quoted values", () => {
    luceneFilter(mockDb, qb, 'field:""', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "");
  });

  it("handles single character quoted values", () => {
    luceneFilter(mockDb, qb, 'field:"a"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "a");
  });

  it("handles quoted values with operators", () => {
    luceneFilter(mockDb, qb, 'date:>"2023-01-01"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("date", ">", "2023-01-01");
  });

  it("handles negated quoted values", () => {
    luceneFilter(mockDb, qb, '-email:"blocked@example.com"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(
      "email",
      "!=",
      "blocked@example.com",
    );
  });

  it("handles mixed quoted and unquoted values", () => {
    luceneFilter(
      mockDb,
      qb,
      'email:"test@example.com" status:active',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(2);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "test@example.com");
    expect(mockQb.where).toHaveBeenCalledWith("status", "=", "active");
  });

  // Edge cases
  it("handles values with only opening quote", () => {
    luceneFilter(mockDb, qb, 'field:"value', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", '"value');
  });

  it("handles values with only closing quote", () => {
    luceneFilter(mockDb, qb, 'field:value"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", 'value"');
  });

  it("handles values with quotes in the middle", () => {
    luceneFilter(mockDb, qb, 'field:val"ue', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", 'val"ue');
  });

  // Common use cases
  it("handles email searches properly", () => {
    luceneFilter(mockDb, qb, 'email:"user@domain.com"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "user@domain.com");
  });

  it("handles phone number searches", () => {
    luceneFilter(
      mockDb,
      qb,
      'phone_number:"+1-555-123-4567"',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(
      "phone_number",
      "=",
      "+1-555-123-4567",
    );
  });

  it("handles user ID searches with pipes", () => {
    luceneFilter(mockDb, qb, 'user_id:"auth0|123456789"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(
      "user_id",
      "=",
      "auth0|123456789",
    );
  });

  it("handles complex queries with quotes and operators", () => {
    luceneFilter(
      mockDb,
      qb,
      'email:"test@example.com" created_at:>"2023-01-01" -status:"banned"',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(3);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "test@example.com");
    expect(mockQb.where).toHaveBeenCalledWith("created_at", ">", "2023-01-01");
    expect(mockQb.where).toHaveBeenCalledWith("status", "!=", "banned");
  });

  // OR logic tests
  it("handles simple OR query and unescapes values in the OR branch", () => {
    luceneFilter(
      mockDb,
      qb,
      "field1:a\\-b OR field2:value2",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));

    // The OR branch builds its conditions inside the callback handed to
    // `where`, so exercising the callback is the only way to confirm operands
    // are Lucene-unescaped there too (the AND path is covered separately).
    const orCallback = mockQb.where.mock.calls[0]![0] as (
      eb: ReturnType<typeof makeExpressionBuilderStub>,
    ) => unknown;
    const eb = makeExpressionBuilderStub();
    orCallback(eb);
    expect(eb).toHaveBeenCalledWith("field1", "=", "a-b");
    expect(eb).toHaveBeenCalledWith("field2", "=", "value2");
  });

  it("handles OR query with multiple fields", () => {
    luceneFilter(
      mockDb,
      qb,
      "id:tenant1 OR id:tenant2 OR id:tenant3",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query with quoted values", () => {
    luceneFilter(
      mockDb,
      qb,
      'name:"John Doe" OR name:"Jane Smith"',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query case-insensitively", () => {
    luceneFilter(
      mockDb,
      qb,
      "field1:value1 or field2:value2",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query with mixed case", () => {
    luceneFilter(
      mockDb,
      qb,
      "field1:value1 Or field2:value2",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("keeps a quoted value carrying ` OR ` in a single clause", () => {
    // Issue #1264: the OR split used to run before tokenizing, so the quotes
    // only bracketed the outer fragments and `user_id:victim` in the middle
    // became a clause of its own. The whole value is one literal now, which
    // takes the AND path (no `where(callback)`).
    luceneFilter(
      mockDb,
      qb,
      'user_id:"attacker OR user_id:victim OR x"',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(1);
    expect(mockQb.where).toHaveBeenCalledWith(
      "user_id",
      "=",
      "attacker OR user_id:victim OR x",
    );
  });

  it("does not let an escaped quote end the quoted value", () => {
    luceneFilter(
      mockDb,
      qb,
      'user_id:"attacker\\" OR user_id:victim OR \\"x"',
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(1);
    expect(mockQb.where).toHaveBeenCalledWith(
      "user_id",
      "=",
      'attacker" OR user_id:victim OR "x',
    );
  });

  it("conjoins the clauses within an OR group", () => {
    luceneFilter(
      mockDb,
      qb,
      "field1:value1 field2:value2 OR field3:value3",
      searchableColumns,
    );

    const orCallback = mockQb.where.mock.calls[0]![0] as (
      eb: ReturnType<typeof makeExpressionBuilderStub>,
    ) => unknown;
    const eb = makeExpressionBuilderStub();
    orCallback(eb);
    expect(eb).toHaveBeenCalledWith("field1", "=", "value1");
    expect(eb).toHaveBeenCalledWith("field2", "=", "value2");
    expect(eb).toHaveBeenCalledWith("field3", "=", "value3");
    // The first group's two clauses are ANDed, then ORed with the second.
    expect(eb.and).toHaveBeenCalledTimes(1);
    expect(eb.or.mock.calls[0]![0]).toHaveLength(2);
  });

  // Server-side callers interpolate ids through escapeLuceneValue; the value
  // has to come back out of the filter unchanged, operators and all.
  it("round-trips an escaped value as one exact operand", () => {
    const value = 'auth0|a" OR user_id:victim OR "b\\c';
    luceneFilter(
      mockDb,
      qb,
      `user_id:${escapeLuceneValue(value)}`,
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(1);
    expect(mockQb.where).toHaveBeenCalledWith("user_id", "=", value);
  });
});

describe("escapeLuceneValue", () => {
  it("quotes the value so whitespace cannot end the clause", () => {
    expect(escapeLuceneValue("attacker OR user_id:victim OR x")).toBe(
      '"attacker OR user_id:victim OR x"',
    );
  });

  it("escapes quotes and backslashes so the quoting cannot be closed", () => {
    expect(escapeLuceneValue('a" OR b')).toBe('"a\\" OR b"');
    expect(escapeLuceneValue("a\\b")).toBe('"a\\\\b"');
  });
});

describe("sanitizeLuceneQuery", () => {
  const allowed = ["name", "display_name"];

  it("keeps clauses on allowed fields", () => {
    expect(sanitizeLuceneQuery("name:foo", allowed)).toBe("name:foo");
    expect(sanitizeLuceneQuery("display_name:foo", allowed)).toBe(
      "display_name:foo",
    );
  });

  it("drops clauses on disallowed fields", () => {
    expect(sanitizeLuceneQuery("created_at:2020", allowed)).toBe("");
    expect(sanitizeLuceneQuery("metadata:foo", allowed)).toBe("");
  });

  it("preserves bare-string tokens", () => {
    expect(sanitizeLuceneQuery("acme", allowed)).toBe("acme");
  });

  it("drops disallowed fields but keeps allowed ones in mixed AND queries", () => {
    expect(sanitizeLuceneQuery("name:foo created_at:2020 acme", allowed)).toBe(
      "name:foo acme",
    );
  });

  it("handles negation, _exists_, and = syntax", () => {
    expect(sanitizeLuceneQuery("-name:foo", allowed)).toBe("-name:foo");
    expect(sanitizeLuceneQuery("-created_at:2020", allowed)).toBe("");
    expect(sanitizeLuceneQuery("_exists_:name", allowed)).toBe("_exists_:name");
    expect(sanitizeLuceneQuery("_exists_:tenant_id", allowed)).toBe("");
    expect(sanitizeLuceneQuery("name=foo", allowed)).toBe("name=foo");
    expect(sanitizeLuceneQuery("tenant_id=other", allowed)).toBe("");
  });

  it("filters OR parts independently", () => {
    expect(sanitizeLuceneQuery("name:foo OR tenant_id:other", allowed)).toBe(
      "name:foo",
    );
    expect(sanitizeLuceneQuery("evil:x OR another_evil:y", allowed)).toBe("");
  });

  it("respects quoted values when tokenizing", () => {
    expect(sanitizeLuceneQuery('name:"John Doe"', allowed)).toBe(
      'name:"John Doe"',
    );
    expect(sanitizeLuceneQuery('tenant_id:"x" name:"John Doe"', allowed)).toBe(
      'name:"John Doe"',
    );
  });

  it("does not split a quoted value that contains ` OR `", () => {
    // The whole clause is one allowed `name` token, so it survives intact
    // instead of being cut into `name:"John` plus a bogus `tenant_id` part.
    expect(
      sanitizeLuceneQuery('name:"John OR tenant_id:other OR Doe"', allowed),
    ).toBe('name:"John OR tenant_id:other OR Doe"');
  });

  it("keeps filtering the parts of a genuine OR query", () => {
    expect(
      sanitizeLuceneQuery(
        'name:"John Doe" tenant_id:x OR display_name:acme',
        allowed,
      ),
    ).toBe('name:"John Doe" OR display_name:acme');
  });
});
