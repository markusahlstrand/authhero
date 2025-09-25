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

  describe("wildcard path matching", () => {
    it("should allow wildcard paths when configured", () => {
      expect(
        isValidRedirectUrl(
          "https://example.com/callback",
          ["https://example.com/*"],
          { allowPathWildcards: true },
        ),
      ).toBe(true);
    });

    it("should not allow wildcard paths when not configured", () => {
      expect(
        isValidRedirectUrl("https://example.com/callback", [
          "https://example.com/*",
        ]),
      ).toBe(false);
    });
  });

  describe("subdomain wildcard matching", () => {
    describe("when enableSubDomainWildcards is true", () => {
      it("should match wildcard domains", () => {
        expect(
          isValidRedirectUrl(
            "https://app.example.com/callback",
            ["https://*.example.com/callback"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(true);

        expect(
          isValidRedirectUrl(
            "https://api.sesamy.com/callback",
            ["https://*.sesamy.com/callback"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(true);

        expect(
          isValidRedirectUrl(
            "https://sub.domain.example.com",
            ["https://*.example.com"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(true);
      });

      it("should match exact domains when wildcard is used", () => {
        expect(
          isValidRedirectUrl(
            "https://example.com/callback",
            ["https://*.example.com/callback"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(true);
      });

      it("should work with both path and subdomain wildcards", () => {
        expect(
          isValidRedirectUrl(
            "https://app.example.com/some/path",
            ["https://*.example.com/*"],
            { allowPathWildcards: true, enableSubDomainWildcards: true },
          ),
        ).toBe(true);
      });
    });

    describe("when enableSubDomainWildcards is false or not set", () => {
      it("should not match wildcard domains by default", () => {
        expect(
          isValidRedirectUrl("https://app.example.com/callback", [
            "https://*.example.com/callback",
          ]),
        ).toBe(false);

        expect(
          isValidRedirectUrl(
            "https://api.sesamy.com/callback",
            ["https://*.sesamy.com/callback"],
            { enableSubDomainWildcards: false },
          ),
        ).toBe(false);
      });

      it("should only match exact hostnames", () => {
        expect(
          isValidRedirectUrl("https://example.com/callback", [
            "https://example.com/callback",
          ]),
        ).toBe(true);

        expect(
          isValidRedirectUrl("https://app.example.com/callback", [
            "https://app.example.com/callback",
          ]),
        ).toBe(true);
      });
    });

    describe("security validations", () => {
      it("should not match invalid wildcard patterns even when enabled", () => {
        expect(
          isValidRedirectUrl(
            "https://evil.com",
            ["https://*.example.com"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(false);

        expect(
          isValidRedirectUrl(
            "https://example.com.evil.com",
            ["https://*.example.com"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(false);
      });

      it("should not allow wildcard matching for non-HTTP(S) protocols", () => {
        expect(
          isValidRedirectUrl(
            "file://test.example.com",
            ["file://*.example.com"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(false);

        expect(
          isValidRedirectUrl(
            "ftp://test.example.com",
            ["ftp://*.example.com"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(false);
      });

      it("should require proper domain structure for wildcards", () => {
        // Wildcard domain must have at least one dot after the *
        expect(
          isValidRedirectUrl(
            "https://test.com",
            ["https://*.com"],
            { enableSubDomainWildcards: true },
          ),
        ).toBe(false);
      });
    });
  });
});
