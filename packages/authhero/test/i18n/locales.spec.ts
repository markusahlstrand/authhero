import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(__dirname, "../../locales");

type LocaleData = Record<string, Record<string, Record<string, string>>>;

function loadLocale(locale: string): LocaleData {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function getEntries(data: LocaleData): [string, string][] {
  const entries: [string, string][] = [];
  for (const [prompt, screens] of Object.entries(data)) {
    for (const [screen, translations] of Object.entries(screens)) {
      for (const [key, value] of Object.entries(translations)) {
        entries.push([`${prompt}.${screen}.${key}`, value]);
      }
    }
  }
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function getKeys(data: LocaleData): string[] {
  return getEntries(data).map(([key]) => key);
}

const localeFiles = fs
  .readdirSync(LOCALES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""));

const en = loadLocale("en");
const enKeys = getKeys(en);

describe("locale completeness", () => {
  const otherLocales = localeFiles.filter((l) => l !== "en");

  it.each(otherLocales)(
    "%s has all keys from en.json",
    (locale) => {
      const data = loadLocale(locale);
      const localeKeys = new Set(getKeys(data));

      const missing = enKeys.filter((key) => !localeKeys.has(key));

      expect(missing, `Missing keys in ${locale}.json`).toEqual([]);
    },
  );

  it.each(otherLocales)(
    "%s has no extra keys not in en.json",
    (locale) => {
      const data = loadLocale(locale);
      const localeKeys = getKeys(data);
      const enKeySet = new Set(enKeys);

      const extra = localeKeys.filter((key) => !enKeySet.has(key));

      expect(extra, `Extra keys in ${locale}.json not in en.json`).toEqual([]);
    },
  );

  it.each(otherLocales)(
    "%s has all keys translated",
    (locale) => {
      const data = loadLocale(locale);
      const enEntries = getEntries(en);
      const localeEntries = new Map(getEntries(data));

      // Skip values where all non-template, non-punctuation words are common
      // loanwords used identically across languages (e.g. "Status | ${clientName}")
      const loanwords = new Set(["email", "status", "password", "ok", "invitation"]);
      const canBeIdentical = (value: string) => {
        const words = value
          .replace(/\$\{[^}]+\}/g, "")
          .replace(/[©|]/g, "")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        return words.every((w) => loanwords.has(w.toLowerCase()));
      };

      const untranslated = enEntries
        .filter(
          ([key, enValue]) =>
            !canBeIdentical(enValue) && localeEntries.get(key) === enValue,
        )
        .map(([key]) => key);

      expect(
        untranslated,
        `Untranslated keys in ${locale}.json (identical to en.json)`,
      ).toEqual([]);
    },
  );

  it("all locale values are non-empty strings", () => {
    for (const locale of localeFiles) {
      const data = loadLocale(locale);
      for (const [prompt, screens] of Object.entries(data)) {
        for (const [screen, translations] of Object.entries(screens)) {
          for (const [key, value] of Object.entries(translations)) {
            expect(
              typeof value === "string" && value.length > 0,
              `${locale}.json: ${prompt}.${screen}.${key} is empty or not a string`,
            ).toBe(true);
          }
        }
      }
    }
  });
});
