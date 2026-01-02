import { describe, it, expect, vi, beforeEach } from "vitest";
import { Kysely } from "kysely";
import { luceneFilter } from "../../src/helpers/filter";

describe("luceneFilter", () => {
  // Mock Kysely instance
  const mockDb = {
    dynamic: {
      ref: vi.fn((col) => col),
    },
  } as unknown as Kysely<any>;

  // Mock query builder
  const mockQb = {
    where: vi.fn().mockReturnThis(),
  };

  const searchableColumns = ["title", "description"];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles single word search", () => {
    luceneFilter(mockDb, mockQb as any, "test", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles exact match query", () => {
    luceneFilter(mockDb, mockQb as any, "field:value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "value");
  });

  it("handles negation query", () => {
    luceneFilter(mockDb, mockQb as any, "-field:value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "!=", "value");
  });

  it("handles greater than query", () => {
    luceneFilter(mockDb, mockQb as any, "field:>value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">", "value");
  });

  it("handles greater than or equal to query", () => {
    luceneFilter(mockDb, mockQb as any, "field:>=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">=", "value");
  });

  it("handles less than query", () => {
    luceneFilter(mockDb, mockQb as any, "field:<value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<", "value");
  });

  it("handles less than or equal to query", () => {
    luceneFilter(mockDb, mockQb as any, "field:<=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<=", "value");
  });

  it("handles negated greater than query", () => {
    luceneFilter(mockDb, mockQb as any, "-field:>value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<=", "value");
  });

  it("handles negated greater than or equal to query", () => {
    luceneFilter(mockDb, mockQb as any, "-field:>=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "<", "value");
  });

  it("handles negated less than query", () => {
    luceneFilter(mockDb, mockQb as any, "-field:<value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">=", "value");
  });

  it("handles negated less than or equal to query", () => {
    luceneFilter(mockDb, mockQb as any, "-field:<=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", ">", "value");
  });

  it("handles exists query", () => {
    luceneFilter(mockDb, mockQb as any, "_exists_:field", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "is not", null);
  });

  it("handles not exists query", () => {
    luceneFilter(mockDb, mockQb as any, "-_exists_:field", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "is", null);
  });

  it("handles multiple conditions", () => {
    luceneFilter(
      mockDb,
      mockQb as any,
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
      mockQb as any,
      "searchword field:>=value _exists_:field2",
      searchableColumns,
    );
    expect(mockQb.where).toHaveBeenCalledTimes(3);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
    expect(mockQb.where).toHaveBeenCalledWith("field", ">=", "value");
    expect(mockQb.where).toHaveBeenCalledWith("field2", "is not", null);
  });

  it('handles query with "=" instead of ":"', () => {
    luceneFilter(mockDb, mockQb as any, "field=value", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "value");
  });

  // Quote handling tests
  it("handles quoted values", () => {
    luceneFilter(mockDb, mockQb as any, 'email:"test@example.com"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "test@example.com");
  });

  it("handles quoted values with spaces", () => {
    luceneFilter(mockDb, mockQb as any, 'name:"John Doe"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("name", "=", "John Doe");
  });

  it("handles quoted values with special characters", () => {
    luceneFilter(mockDb, mockQb as any, 'description:"Value with @#$% special chars"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("description", "=", "Value with @#$% special chars");
  });

  it("handles empty quoted values", () => {
    luceneFilter(mockDb, mockQb as any, 'field:""', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "");
  });

  it("handles single character quoted values", () => {
    luceneFilter(mockDb, mockQb as any, 'field:"a"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", "a");
  });

  it("handles quoted values with operators", () => {
    luceneFilter(mockDb, mockQb as any, 'date:>"2023-01-01"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("date", ">", "2023-01-01");
  });

  it("handles negated quoted values", () => {
    luceneFilter(mockDb, mockQb as any, '-email:"blocked@example.com"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("email", "!=", "blocked@example.com");
  });

  it("handles mixed quoted and unquoted values", () => {
    luceneFilter(mockDb, mockQb as any, 'email:"test@example.com" status:active', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledTimes(2);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "test@example.com");
    expect(mockQb.where).toHaveBeenCalledWith("status", "=", "active");
  });

  // Edge cases
  it("handles values with only opening quote", () => {
    luceneFilter(mockDb, mockQb as any, 'field:"value', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", '"value');
  });

  it("handles values with only closing quote", () => {
    luceneFilter(mockDb, mockQb as any, 'field:value"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", 'value"');
  });

  it("handles values with quotes in the middle", () => {
    luceneFilter(mockDb, mockQb as any, 'field:val"ue', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("field", "=", 'val"ue');
  });

  // Common use cases
  it("handles email searches properly", () => {
    luceneFilter(mockDb, mockQb as any, 'email:"user@domain.com"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "user@domain.com");
  });

  it("handles phone number searches", () => {
    luceneFilter(mockDb, mockQb as any, 'phone_number:"+1-555-123-4567"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("phone_number", "=", "+1-555-123-4567");
  });

  it("handles user ID searches with pipes", () => {
    luceneFilter(mockDb, mockQb as any, 'user_id:"auth0|123456789"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith("user_id", "=", "auth0|123456789");
  });

  it("handles complex queries with quotes and operators", () => {
    luceneFilter(
      mockDb, 
      mockQb as any, 
      'email:"test@example.com" created_at:>"2023-01-01" -status:"banned"', 
      searchableColumns
    );
    expect(mockQb.where).toHaveBeenCalledTimes(3);
    expect(mockQb.where).toHaveBeenCalledWith("email", "=", "test@example.com");
    expect(mockQb.where).toHaveBeenCalledWith("created_at", ">", "2023-01-01");
    expect(mockQb.where).toHaveBeenCalledWith("status", "!=", "banned");
  });

  // OR logic tests
  it("handles simple OR query", () => {
    luceneFilter(mockDb, mockQb as any, "field1:value1 OR field2:value2", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query with multiple fields", () => {
    luceneFilter(mockDb, mockQb as any, "id:tenant1 OR id:tenant2 OR id:tenant3", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query with quoted values", () => {
    luceneFilter(mockDb, mockQb as any, 'name:"John Doe" OR name:"Jane Smith"', searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query case-insensitively", () => {
    luceneFilter(mockDb, mockQb as any, "field1:value1 or field2:value2", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles OR query with mixed case", () => {
    luceneFilter(mockDb, mockQb as any, "field1:value1 Or field2:value2", searchableColumns);
    expect(mockQb.where).toHaveBeenCalledWith(expect.any(Function));
  });
});
