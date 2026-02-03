import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  escapeJs,
  escapeCssUrl,
  sanitizeUrl,
  sanitizeCssColor,
  buildPageBackground,
  buildThemePageBackground,
} from "../../../src/routes/universal-login/sanitization-utils";

describe("sanitization-utils", () => {
  describe("escapeHtml", () => {
    it("should escape HTML special characters", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;",
      );
      expect(escapeHtml('test "quote" &amp')).toBe(
        "test &quot;quote&quot; &amp;amp",
      );
    });
  });

  describe("escapeJs", () => {
    it("should escape JavaScript string characters", () => {
      expect(escapeJs("test'string")).toBe("test\\'string");
      expect(escapeJs('test"string')).toBe('test\\"string');
      expect(escapeJs("test\nline")).toBe("test\\nline");
      expect(escapeJs("<script>")).toBe("\\x3cscript\\x3e");
    });
  });

  describe("escapeCssUrl", () => {
    it("should escape characters that could break out of CSS url()", () => {
      // Normal URLs should pass through with minimal changes
      expect(escapeCssUrl("https://example.com/image.jpg")).toBe(
        "https://example.com/image.jpg",
      );

      // Parentheses should be escaped to prevent breaking out of url()
      expect(escapeCssUrl("https://example.com/image.jpg)injected")).toBe(
        "https://example.com/image.jpg\\)injected",
      );

      // Both opening and closing parens
      expect(escapeCssUrl("test(value)")).toBe("test\\(value\\)");

      // Double quotes should be escaped (we use quoted url syntax)
      expect(escapeCssUrl('url"break')).toBe('url\\"break');

      // Single quotes should be escaped for safety
      expect(escapeCssUrl("url'break")).toBe("url\\'break");

      // Backslashes should be escaped
      expect(escapeCssUrl("path\\to\\file")).toBe("path\\\\to\\\\file");

      // Newlines should be removed (CSS injection vector)
      expect(escapeCssUrl("url\ninjection")).toBe("urlinjection");
      expect(escapeCssUrl("url\rinjection")).toBe("urlinjection");
      expect(escapeCssUrl("url\tinjection")).toBe("urlinjection");
    });

    it("should prevent CSS injection through url() breakout", () => {
      // This malicious URL tries to break out of url() and inject CSS
      const maliciousUrl =
        "https://evil.com/img.jpg); background: red; (fake: url(";
      const escaped = escapeCssUrl(maliciousUrl);

      // Parentheses should be escaped, preventing breakout
      expect(escaped).toBe(
        "https://evil.com/img.jpg\\); background: red; \\(fake: url\\(",
      );
      // The ) is escaped with backslash, which prevents CSS breakout
      expect(escaped).toContain("\\)");
    });
  });

  describe("sanitizeUrl", () => {
    it("should allow http and https URLs", () => {
      expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
      expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    });

    it("should allow relative URLs starting with /", () => {
      expect(sanitizeUrl("/path/to/resource")).toBe("/path/to/resource");
    });

    it("should reject javascript: URLs", () => {
      expect(sanitizeUrl("javascript:alert(1)")).toBe("");
    });

    it("should escape HTML in URLs", () => {
      expect(sanitizeUrl("https://example.com?q=<script>")).toBe(
        "https://example.com?q=&lt;script&gt;",
      );
    });
  });

  describe("sanitizeCssColor", () => {
    it("should allow valid CSS colors", () => {
      expect(sanitizeCssColor("#fff")).toBe("#fff");
      expect(sanitizeCssColor("#ffffff")).toBe("#ffffff");
      expect(sanitizeCssColor("rgb(255, 255, 255)")).toBe("rgb(255, 255, 255)");
      expect(sanitizeCssColor("red")).toBe("red");
    });

    it("should reject invalid CSS colors", () => {
      expect(sanitizeCssColor("url(evil.com)")).toBe("");
      expect(sanitizeCssColor("expression(alert(1))")).toBe("");
    });
  });

  describe("buildThemePageBackground", () => {
    it("should use quoted url() syntax with escaped URL", () => {
      const result = buildThemePageBackground(
        {
          background_image_url: "https://example.com/image.jpg",
          background_color: "#ffffff",
        },
        undefined,
      );

      // Should use quoted url("...") syntax
      expect(result).toContain('url("');
      expect(result).toBe(
        '#ffffff url("https://example.com/image.jpg") center / cover no-repeat',
      );
    });

    it("should escape dangerous characters in image URL", () => {
      const result = buildThemePageBackground(
        {
          background_image_url:
            "https://example.com/image.jpg)injected: value; (test",
          background_color: "#ffffff",
        },
        undefined,
      );

      // Parentheses should be escaped in the output
      expect(result).toContain("\\)");
      expect(result).toContain("\\(");
      // Should contain properly escaped content
      expect(result).toBe(
        '#ffffff url("https://example.com/image.jpg\\)injected: value; \\(test") center / cover no-repeat',
      );
    });

    it("should fall back to branding background when no image URL", () => {
      const result = buildThemePageBackground(undefined, "#ff0000");

      expect(result).toBe("#ff0000");
    });

    it("should use theme background color when no image URL", () => {
      const result = buildThemePageBackground(
        {
          background_color: "#0000ff",
        },
        "#ff0000",
      );

      expect(result).toBe("#0000ff");
    });
  });
});
