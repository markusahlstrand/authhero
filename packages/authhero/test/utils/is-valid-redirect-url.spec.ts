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

  describe("query parameter matching", () => {
    it("rejects an added query parameter not present in the registration", () => {
      // OIDC conformance `oidcc-redirect-uri-query-added`: registered URI has no
      // query string, request adds one — must not match.
      expect(
        isValidRedirectUrl("https://example.com/callback?evil=1", [
          "https://example.com/callback",
        ]),
      ).toBe(false);
    });

    it("rejects an extra query parameter alongside a registered one", () => {
      expect(
        isValidRedirectUrl("https://example.com/callback?a=1&b=2", [
          "https://example.com/callback?a=1",
        ]),
      ).toBe(false);
    });

    it("requires registered query parameters to be present and unchanged", () => {
      expect(
        isValidRedirectUrl("https://example.com/callback", [
          "https://example.com/callback?a=1",
        ]),
      ).toBe(false);

      expect(
        isValidRedirectUrl("https://example.com/callback?a=2", [
          "https://example.com/callback?a=1",
        ]),
      ).toBe(false);
    });

    it("allows an exact query string match", () => {
      expect(
        isValidRedirectUrl("https://example.com/callback?a=1&b=2", [
          "https://example.com/callback?a=1&b=2",
        ]),
      ).toBe(true);
    });

    it("ignores query parameter ordering", () => {
      expect(
        isValidRedirectUrl("https://example.com/callback?b=2&a=1", [
          "https://example.com/callback?a=1&b=2",
        ]),
      ).toBe(true);
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
    describe("when allowSubDomainWildcards is true", () => {
      it("should match wildcard domains", () => {
        expect(
          isValidRedirectUrl(
            "https://app.example.com/callback",
            ["https://*.example.com/callback"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(true);

        expect(
          isValidRedirectUrl(
            "https://api.sesamy.com/callback",
            ["https://*.sesamy.com/callback"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(true);

        expect(
          isValidRedirectUrl(
            "https://sub.domain.example.com",
            ["https://*.example.com"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(true);
      });

      it("should match Vercel-style subdomain URLs", () => {
        // Test basic subdomain wildcard first
        expect(
          isValidRedirectUrl(
            "https://test.example.com",
            ["https://*.example.com"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(true);

        // Test the specific Vercel case with exact path
        expect(
          isValidRedirectUrl(
            "https://account-drr49y1tn.vercel.sesamy.dev/subscriptions/kvartal",
            ["https://*.vercel.sesamy.dev/subscriptions/kvartal"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(true);
      });

      it("should match exact domains when wildcard is used", () => {
        expect(
          isValidRedirectUrl(
            "https://example.com/callback",
            ["https://*.example.com/callback"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(true);
      });

      it("should work with both path and subdomain wildcards", () => {
        expect(
          isValidRedirectUrl(
            "https://app.example.com/some/path",
            ["https://*.example.com/*"],
            { allowPathWildcards: true, allowSubDomainWildcards: true },
          ),
        ).toBe(true);
      });
    });

    describe("when allowSubDomainWildcards is false or not set", () => {
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
            { allowSubDomainWildcards: false },
          ),
        ).toBe(false);

        expect(
          isValidRedirectUrl(
            "https://account-drr49y1tn.vercel.sesamy.dev/subscriptions/kvartal",
            ["https://*.vercel.sesamy.dev/subscriptions/kvartal"],
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
          isValidRedirectUrl("https://evil.com", ["https://*.example.com"], {
            allowSubDomainWildcards: true,
          }),
        ).toBe(false);

        expect(
          isValidRedirectUrl(
            "https://example.com.evil.com",
            ["https://*.example.com"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(false);
      });

      it("should not allow wildcard matching for non-HTTP(S) protocols", () => {
        expect(
          isValidRedirectUrl(
            "file://test.example.com",
            ["file://*.example.com"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(false);

        expect(
          isValidRedirectUrl(
            "ftp://test.example.com",
            ["ftp://*.example.com"],
            { allowSubDomainWildcards: true },
          ),
        ).toBe(false);
      });

      it("should require proper domain structure for wildcards", () => {
        // Wildcard domain must have at least one dot after the *
        expect(
          isValidRedirectUrl("https://test.com", ["https://*.com"], {
            allowSubDomainWildcards: true,
          }),
        ).toBe(false);
      });
    });
  });
});
