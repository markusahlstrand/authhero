import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  normalizeEmail,
  withNormalizedEmail,
} from "../../src/utils/email";

describe("normalizeEmail", () => {
  it("lowercases", () => {
    expect(normalizeEmail("John.Doe@Example.COM")).toBe("john.doe@example.com");
  });

  it("strips leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@example.com")).toBe("user@example.com");
    expect(normalizeEmail("user@example.com  ")).toBe("user@example.com");
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("strips tabs, newlines and other whitespace forms", () => {
    expect(normalizeEmail("\tuser@example.com\n")).toBe("user@example.com");
    expect(normalizeEmail("\r\n user@example.com  ")).toBe("user@example.com");
  });

  it("trims and lowercases together", () => {
    expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com");
  });

  it("leaves an already-normalized address untouched", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("does not touch inner characters", () => {
    expect(normalizeEmail(" first.last+tag@sub.example.com ")).toBe(
      "first.last+tag@sub.example.com",
    );
  });

  it("produces a value the email validator accepts", () => {
    // The padded form is rejected by EMAIL_REGEX (it forbids whitespace), which
    // is exactly why the un-normalized value must never reach the store.
    expect(isValidEmail(" User@Example.COM ")).toBe(false);
    expect(isValidEmail(normalizeEmail(" User@Example.COM "))).toBe(true);
  });
});

describe("withNormalizedEmail", () => {
  it("trims and lowercases the email field", () => {
    expect(withNormalizedEmail({ email: "  Foo@Example.COM " })).toEqual({
      email: "foo@example.com",
    });
  });

  it("preserves the other fields", () => {
    expect(
      withNormalizedEmail({
        email: " Foo@Example.COM ",
        name: "Foo",
        email_verified: true,
      }),
    ).toEqual({
      email: "foo@example.com",
      name: "Foo",
      email_verified: true,
    });
  });

  it("returns the same object when the email is already normalized", () => {
    const payload = { email: "foo@example.com" };
    expect(withNormalizedEmail(payload)).toBe(payload);
  });

  it("returns the same object when there is no email", () => {
    const payload = { name: "no email here" };
    expect(withNormalizedEmail(payload)).toBe(payload);
  });

  it("does not mutate the input", () => {
    const payload = { email: " Foo@Example.COM " };
    withNormalizedEmail(payload);
    expect(payload.email).toBe(" Foo@Example.COM ");
  });
});
