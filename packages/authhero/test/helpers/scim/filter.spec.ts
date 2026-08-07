import { describe, it, expect } from "vitest";
import {
  parseScimFilter,
  evaluateScimFilter,
  asSingleEquality,
  UnsupportedFilterError,
  InvalidFilterError,
} from "../../../src/helpers/scim/filter";

describe("SCIM filter parser", () => {
  it("parses a single eq (the common IdP lookup)", () => {
    const ast = parseScimFilter('userName eq "alice@example.com"');
    expect(ast).toEqual({
      type: "eq",
      attribute: "userName",
      value: "alice@example.com",
    });
    expect(asSingleEquality(ast)).toEqual({
      attribute: "userName",
      value: "alice@example.com",
    });
  });

  it("parses externalId eq", () => {
    const ast = parseScimFilter('externalId eq "ext-123"');
    expect(asSingleEquality(ast)?.value).toBe("ext-123");
  });

  it("handles and/or with correct precedence (and binds tighter)", () => {
    const ast = parseScimFilter(
      'userName eq "a" or userName eq "b" and externalId eq "c"',
    );
    // Expect: a OR (b AND c)
    expect(ast.type).toBe("or");
    if (ast.type === "or") {
      expect(ast.right.type).toBe("and");
    }
    expect(asSingleEquality(ast)).toBeNull();
  });

  it("respects parentheses", () => {
    const ast = parseScimFilter(
      '(userName eq "a" or userName eq "b") and active eq true',
    );
    expect(ast.type).toBe("and");
  });

  it("evaluates eq case-insensitively on attribute name", () => {
    const ast = parseScimFilter('userName eq "alice"');
    expect(
      evaluateScimFilter(ast, { username: "alice", externalId: "x" }),
    ).toBe(true);
    expect(evaluateScimFilter(ast, { userName: "bob" })).toBe(false);
  });

  it("evaluates and / or", () => {
    const attrs = { userName: "alice", externalId: "e1", active: true };
    expect(
      evaluateScimFilter(
        parseScimFilter('userName eq "alice" and externalId eq "e1"'),
        attrs,
      ),
    ).toBe(true);
    expect(
      evaluateScimFilter(
        parseScimFilter('userName eq "nope" or externalId eq "e1"'),
        attrs,
      ),
    ).toBe(true);
    expect(
      evaluateScimFilter(
        parseScimFilter('userName eq "nope" and externalId eq "e1"'),
        attrs,
      ),
    ).toBe(false);
  });

  it("evaluates boolean active eq", () => {
    const ast = parseScimFilter("active eq false");
    expect(evaluateScimFilter(ast, { active: false })).toBe(true);
    expect(evaluateScimFilter(ast, { active: true })).toBe(false);
  });

  it("rejects unsupported operators loudly", () => {
    expect(() => parseScimFilter('userName co "ali"')).toThrow(
      UnsupportedFilterError,
    );
    expect(() => parseScimFilter("userName pr")).toThrow();
  });

  it("rejects malformed filters", () => {
    expect(() => parseScimFilter('userName eq "unterminated')).toThrow(
      InvalidFilterError,
    );
    expect(() => parseScimFilter('(userName eq "a"')).toThrow(
      InvalidFilterError,
    );
  });
});
