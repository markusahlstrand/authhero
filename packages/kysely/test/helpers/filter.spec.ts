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
});
