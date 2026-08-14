import { describe, it, expect } from "vitest";
import {
  resolveLocale,
  resolveLanguage,
  resolveTenantLanguage,
} from "../../src/utils/locale";

describe("resolveLocale", () => {
  it("prefers ui_locales over Accept-Language", () => {
    expect(resolveLocale("nb-NO", "en-US,en;q=0.9")).toBe("nb-NO");
  });

  it("falls back to the best-weighted Accept-Language tag", () => {
    expect(resolveLocale(undefined, "de;q=0.5, en-GB;q=0.9")).toBe("en-GB");
  });

  it("defaults to en when nothing is requested", () => {
    expect(resolveLocale(undefined, undefined)).toBe("en");
  });

  it("skips requested tags outside enabled_locales", () => {
    expect(resolveLocale("en-GB", "sv, nb-NO;q=0.8", ["nb"])).toBe("nb-NO");
  });

  it("falls back to the first enabled locale when nothing matches", () => {
    expect(resolveLocale("en", "en-US,en;q=0.9", ["nb"])).toBe("nb");
    expect(resolveLocale(undefined, undefined, ["nb", "sv"])).toBe("nb");
  });

  it("matches enabled locales on the language subtag", () => {
    expect(resolveLocale("nb-NO", undefined, ["nb"])).toBe("nb-NO");
    expect(resolveLocale("pt", undefined, ["pt-BR"])).toBe("pt");
  });

  it("ignores enabled_locales when empty", () => {
    expect(resolveLocale("en-GB", undefined, [])).toBe("en-GB");
  });
});

describe("resolveLanguage", () => {
  it("reduces the resolved locale to its language subtag", () => {
    expect(resolveLanguage("nb-NO", undefined)).toBe("nb");
    expect(resolveLanguage(undefined, "en-US,en;q=0.9")).toBe("en");
  });

  it("uses the tenant default when the request only asks for disabled languages", () => {
    expect(resolveLanguage("en", "en-US", ["nb"])).toBe("nb");
  });

  it("keeps a requested language that is enabled", () => {
    expect(resolveLanguage("nb en", "en-US", ["nb", "en"])).toBe("nb");
  });

  it("falls back through ui_locales entries to an enabled one", () => {
    expect(resolveLanguage("de nb", undefined, ["nb"])).toBe("nb");
  });
});

describe("resolveTenantLanguage", () => {
  it("returns the language subtag when no restriction is configured", () => {
    expect(resolveTenantLanguage("nb-NO")).toBe("nb");
    expect(resolveTenantLanguage(undefined)).toBe("en");
    expect(resolveTenantLanguage("sv", [])).toBe("sv");
  });

  it("keeps an enabled language", () => {
    expect(resolveTenantLanguage("nb-NO", ["nb"])).toBe("nb");
  });

  it("replaces a disabled language with the tenant default", () => {
    expect(resolveTenantLanguage("en", ["nb"])).toBe("nb");
    expect(resolveTenantLanguage(undefined, ["sv", "en"])).toBe("sv");
  });
});
