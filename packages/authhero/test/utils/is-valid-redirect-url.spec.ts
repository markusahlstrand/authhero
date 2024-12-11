import { describe, it, expect } from "vitest";
import { isValidRedirectUrl } from "../../src/utils/is-valid-redirect-url";

describe("isValidRedirectUrl", () => {
  describe("valid redirect URLs", () => {
    const validUrls = [
      "https://example.com",
      "https://example.com/",
      "https://example.com/callback",
      "https://example.com/callback?param=value",
      "https://sub.example.com/callback",
      "http://localhost",
      "http://localhost:3000",
      "http://localhost:3000/callback",
      "com.example.app://",
      "com.example.app://callback",
      "myapp://",
      "myapp://callback",
    ];

    validUrls.forEach((url) => {
      it(`should allow ${url}`, () => {
        expect(isValidRedirectUrl(url, validUrls)).toBe(true);
      });
    });
  });

  describe("wildcard domain matching", () => {
    it("should match wildcard domains when configured", () => {
      expect(
        isValidRedirectUrl("https://app.example.com", [
          "https://*.example.com",
        ]),
      ).toBe(true);
      expect(
        isValidRedirectUrl("https://app.example.com", [
          "https://*.example.com",
        ]),
      ).toBe(true);
    });

    it("should not match invalid wildcard patterns", () => {
      expect(
        isValidRedirectUrl("https://evil.com", ["https://*.example.com"]),
      ).toBe(false);
      expect(
        isValidRedirectUrl("https://example.com.evil.com", [
          "https://*.example.com",
        ]),
      ).toBe(false);
      expect(
        isValidRedirectUrl("file://test.example.com", ["file://*.example.com"]),
      ).toBe(false);
    });
  });
});
