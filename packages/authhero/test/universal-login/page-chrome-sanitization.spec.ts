/**
 * Pure helpers from `@authhero/widget/page-chrome`.
 *
 * These render into a `<style>` element (the page stylesheet and, in the
 * widget demo server, the body layout), which is a different escaping context
 * from the `style=` attribute authhero's own `sanitization-utils` feeds — the
 * HTML parser decodes entities in an attribute but never inside `<style>`.
 */
import { describe, expect, it } from "vitest";
import {
  buildThemePageBackground,
  darkContrastRatio,
  sanitizeCssUrl,
} from "@authhero/widget/page-chrome";

describe("sanitizeCssUrl", () => {
  it("leaves query separators alone", () => {
    // HTML-escaping here would emit a literal `&amp;` into the stylesheet and
    // the browser would request the wrong query string — fatal for the signed
    // CDN URLs background images usually are.
    expect(
      sanitizeCssUrl("https://cdn.example.com/a.jpg?sig=x&expires=y"),
    ).toBe("https://cdn.example.com/a.jpg?sig=x&expires=y");
  });

  it("percent-encodes angle brackets so a URL can't end the <style>", () => {
    const out = sanitizeCssUrl("https://cdn.example.com/a.jpg?x=</style>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).toContain("%3C");
  });

  it("still escapes the url() delimiters", () => {
    const out = sanitizeCssUrl('https://cdn.example.com/a".jpg');
    expect(out).toBe('https://cdn.example.com/a\\".jpg');
  });

  it("rejects non-http schemes", () => {
    expect(sanitizeCssUrl("javascript:alert(1)")).toBe("");
    expect(sanitizeCssUrl(undefined)).toBe("");
  });

  it("allows root-relative paths", () => {
    expect(sanitizeCssUrl("/assets/bg.png")).toBe("/assets/bg.png");
  });
});

describe("buildThemePageBackground", () => {
  it("keeps the image URL usable in the CSS it builds", () => {
    const css = buildThemePageBackground(
      {
        background_color: "#0f172a",
        background_image_url: "https://cdn.example.com/a.jpg?sig=x&expires=y",
      },
      undefined,
    );
    expect(css).toContain(
      'url("https://cdn.example.com/a.jpg?sig=x&expires=y")',
    );
    expect(css).not.toContain("&amp;");
  });
});

describe("darkContrastRatio", () => {
  it("expands three-digit hex colors", () => {
    // `#fff` parsed as a six-digit value is [0, 15, 255] — a mid blue — which
    // silently produced the wrong dark-mode contrast and primary colors.
    expect(darkContrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
    expect(darkContrastRatio("#fff", "#000")).toBeCloseTo(
      darkContrastRatio("#ffffff", "#000000"),
      10,
    );
  });

  it("ignores an alpha channel", () => {
    expect(darkContrastRatio("#112233ff", "#ffffff")).toBeCloseTo(
      darkContrastRatio("#112233", "#ffffff"),
      10,
    );
  });
});
