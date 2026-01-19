import { describe, it, expect } from "vitest";
import { redactUrlForLogging } from "../../src/utils/url";

describe("redactUrlForLogging", () => {
  it("should redact query parameter values but show names", () => {
    const url = "https://example.com/path?token=secret&code=abc123";
    expect(redactUrlForLogging(url)).toBe(
      "https://example.com/path?token=[REDACTED]&code=[REDACTED]",
    );
  });

  it("should redact hash fragments", () => {
    const url = "https://example.com/path#id_token=secret";
    expect(redactUrlForLogging(url)).toBe(
      "https://example.com/path#[REDACTED]",
    );
  });

  it("should redact both query and hash", () => {
    const url = "https://example.com/path?state=xyz#access_token=secret";
    expect(redactUrlForLogging(url)).toBe(
      "https://example.com/path?state=[REDACTED]#[REDACTED]",
    );
  });

  it("should handle URL objects", () => {
    const url = new URL("https://example.com/path?token=secret");
    expect(redactUrlForLogging(url)).toBe(
      "https://example.com/path?token=[REDACTED]",
    );
  });

  it("should preserve protocol and host", () => {
    const url = "https://auth.example.com:8080/oauth/callback?code=secret";
    expect(redactUrlForLogging(url)).toBe(
      "https://auth.example.com:8080/oauth/callback?code=[REDACTED]",
    );
  });

  it("should handle relative paths with query parameters", () => {
    const url = "/u/continue?state=abc123&code=secret";
    expect(redactUrlForLogging(url)).toBe(
      "/u/continue?state=[REDACTED]&code=[REDACTED]",
    );
  });

  it("should handle relative paths with hash", () => {
    const url = "/callback#token=secret";
    expect(redactUrlForLogging(url)).toBe("/callback#[REDACTED]");
  });

  it("should handle paths without sensitive data", () => {
    const url = "https://example.com/path";
    expect(redactUrlForLogging(url)).toBe("https://example.com/path");
  });

  it("should handle root path", () => {
    const url = "https://example.com/";
    expect(redactUrlForLogging(url)).toBe("https://example.com/");
  });

  it("should handle invalid URL gracefully", () => {
    const url = "not a valid url";
    expect(redactUrlForLogging(url)).toBe("not a valid url");
  });

  it("should handle empty string", () => {
    const url = "";
    expect(redactUrlForLogging(url)).toBe("");
  });

  it("should show parameter names for troubleshooting", () => {
    const tests = [
      {
        url: "https://example.com/callback?code=abc123",
        expected: "https://example.com/callback?code=[REDACTED]",
      },
      {
        url: "https://example.com/callback?state=xyz",
        expected: "https://example.com/callback?state=[REDACTED]",
      },
      {
        url: "https://example.com/callback?token=secret",
        expected: "https://example.com/callback?token=[REDACTED]",
      },
      {
        url: "https://example.com/callback#id_token=jwt.token.here",
        expected: "https://example.com/callback#[REDACTED]",
      },
      {
        url: "https://example.com/callback?email=user@example.com",
        expected: "https://example.com/callback?email=[REDACTED]",
      },
      {
        url: "/u/continue?state=abc&redirect_uri=https://app.com",
        expected: "/u/continue?state=[REDACTED]&redirect_uri=[REDACTED]",
      },
    ];

    tests.forEach(({ url, expected }) => {
      expect(redactUrlForLogging(url)).toBe(expected);
    });
  });
});
