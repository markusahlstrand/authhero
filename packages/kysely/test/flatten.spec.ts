import { describe, it, expect } from "vitest";
import { flattenObject, unflattenObject } from "../src/flatten";

describe("flatten", () => {
  describe("flattenObject", () => {
    it("should flatten a object", () => {
      const flattened = flattenObject({ a: "a", b: { c: "b.c" } });
      expect(flattened).toEqual({ a: "a", b_c: "b.c" });
    });

    it("should flatten a object with null, undefined and integers", () => {
      const flattened = flattenObject({
        a: "a",
        b: { null: null, undefined: undefined, integer: 1 },
      });
      expect(flattened).toEqual({
        a: "a",
        b_integer: 1,
        b_null: null,
        b_undefined: undefined,
      });
    });
  });

  describe("unflattenObject", () => {
    it("should unflatten a object", () => {
      const unflattened = unflattenObject({ a: "a", b_c: "b.c" }, ["b"]);
      expect(unflattened).toEqual({ a: "a", b: { c: "b.c" } });
    });

    it("should unflatten a object with null, undefined and integers", () => {
      const unflattened = unflattenObject(
        {
          a: "a",
          b_integer: 1,
          b_null: null,
          b_undefined: undefined,
        },
        ["b"],
      );
      expect(unflattened).toEqual({
        a: "a",
        b: { null: null, undefined: undefined, integer: 1 },
      });
    });

    it("should unflatten the authParams", () => {
      const unflattened = unflattenObject(
        {
          authParams_client_id: "client_id",
          authParams_expires_at: "2021-01-01",
          created_at: "2021-01-01",
        },
        ["authParams"],
      );
      expect(unflattened).toEqual({
        authParams: {
          client_id: "client_id",
          expires_at: "2021-01-01",
        },
        created_at: "2021-01-01",
      });
    });
  });
});
