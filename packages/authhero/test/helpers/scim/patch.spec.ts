import { describe, it, expect } from "vitest";
import {
  applyScimPatch,
  UnsupportedPatchError,
  InvalidPatchError,
} from "../../../src/helpers/scim/patch";

describe("SCIM patch applier", () => {
  const base = () => ({
    userName: "alice@example.com",
    active: true,
    name: { givenName: "Alice", familyName: "Smith" },
    emails: [{ type: "work", value: "alice@example.com", primary: true }],
  });

  it("replaces a top-level attribute (Entra deactivation)", () => {
    const out = applyScimPatch(base(), [
      { op: "Replace", path: "active", value: false },
    ]);
    expect(out.active).toBe(false);
  });

  it("replaces a nested dotted path", () => {
    const out = applyScimPatch(base(), [
      { op: "replace", path: "name.givenName", value: "Alicia" },
    ]);
    expect((out.name as { givenName: string }).givenName).toBe("Alicia");
  });

  it("merges a pathless value object (Okta-style)", () => {
    const out = applyScimPatch(base(), [
      { op: "replace", value: { active: false, displayName: "Alice S" } },
    ]);
    expect(out.active).toBe(false);
    expect(out.displayName).toBe("Alice S");
    // untouched fields survive
    expect(out.userName).toBe("alice@example.com");
  });

  it("updates a value-filtered multivalued attribute", () => {
    const out = applyScimPatch(base(), [
      { op: "replace", path: 'emails[type eq "work"].value', value: "new@x.io" },
    ]);
    const emails = out.emails as { type: string; value: string }[];
    expect(emails.find((e) => e.type === "work")?.value).toBe("new@x.io");
  });

  it("adds a new value-filtered element when none matches", () => {
    const out = applyScimPatch(base(), [
      { op: "add", path: 'emails[type eq "home"].value', value: "home@x.io" },
    ]);
    const emails = out.emails as { type: string; value: string }[];
    expect(emails.find((e) => e.type === "home")?.value).toBe("home@x.io");
    // existing work email preserved
    expect(emails.find((e) => e.type === "work")?.value).toBe(
      "alice@example.com",
    );
  });

  it("removes an attribute by path", () => {
    const out = applyScimPatch(base(), [
      { op: "remove", path: "name.familyName" },
    ]);
    expect((out.name as { familyName?: string }).familyName).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const input = base();
    applyScimPatch(input, [{ op: "replace", path: "active", value: false }]);
    expect(input.active).toBe(true);
  });

  it("rejects unsupported ops and pathless remove", () => {
    expect(() =>
      applyScimPatch(base(), [{ op: "invalid", path: "active", value: 1 }]),
    ).toThrow(UnsupportedPatchError);
    expect(() => applyScimPatch(base(), [{ op: "remove" }])).toThrow(
      InvalidPatchError,
    );
  });
});
