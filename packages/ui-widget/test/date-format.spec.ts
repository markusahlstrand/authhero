import {
  daysInMonth,
  expandTwoDigitYear,
  getDateLayout,
  getDateOrder,
  parseIsoDate,
  resolveYearAnchor,
  toIsoDate,
} from "../src/utils/date-format";

describe("getDateOrder", () => {
  it("puts the day first for most locales", () => {
    expect(getDateOrder("de")).toEqual(["day", "month", "year"]);
    expect(getDateOrder("fr-FR")).toEqual(["day", "month", "year"]);
    expect(getDateOrder("en-GB")).toEqual(["day", "month", "year"]);
    expect(getDateOrder("nb-NO")).toEqual(["day", "month", "year"]);
  });

  it("puts the month first for US English", () => {
    expect(getDateOrder("en-US")).toEqual(["month", "day", "year"]);
    expect(getDateOrder("en_us")).toEqual(["month", "day", "year"]);
    // A bare "en" carries no region — assume en-US, as Intl does
    expect(getDateOrder("en")).toEqual(["month", "day", "year"]);
  });

  it("puts the year first for big-endian locales", () => {
    expect(getDateOrder("sv")).toEqual(["year", "month", "day"]);
    expect(getDateOrder("sv-SE")).toEqual(["year", "month", "day"]);
    expect(getDateOrder("ja-JP")).toEqual(["year", "month", "day"]);
    expect(getDateOrder("zh-Hans-CN")).toEqual(["year", "month", "day"]);
  });

  it("keeps Finland-Swedish day-first", () => {
    expect(getDateOrder("sv-FI")).toEqual(["day", "month", "year"]);
  });

  it("falls back to day-first for unknown or missing locales", () => {
    expect(getDateOrder(undefined)).toEqual(["day", "month", "year"]);
    expect(getDateOrder("")).toEqual(["day", "month", "year"]);
    expect(getDateOrder("xx-YY")).toEqual(["day", "month", "year"]);
  });
});

describe("getDateLayout", () => {
  it("uses an explicit format over the locale", () => {
    const layout = getDateLayout("MM/DD/YYYY", "sv-SE");
    expect(layout.order).toEqual(["month", "day", "year"]);
    expect(layout.separator).toBe("/");
  });

  it("takes placeholder tokens from the format string", () => {
    const layout = getDateLayout("YYYY-MM-DD", "en-US");
    expect(layout.order).toEqual(["year", "month", "day"]);
    expect(layout.tokens).toEqual({
      year: "YYYY",
      month: "MM",
      day: "DD",
    });
    expect(layout.separator).toBe("-");
  });

  it("ignores a format that does not name all three segments", () => {
    expect(getDateLayout("MM/YYYY", "en-GB").order).toEqual([
      "day",
      "month",
      "year",
    ]);
  });

  it("separates year-first locales with a dash", () => {
    expect(getDateLayout(undefined, "sv").separator).toBe("-");
    expect(getDateLayout(undefined, "lt").separator).toBe("-");
  });

  it("uses the locale's own separator", () => {
    // Dot locales write 14.08.2026
    expect(getDateLayout(undefined, "de").separator).toBe(".");
    expect(getDateLayout(undefined, "de-AT").separator).toBe(".");
    expect(getDateLayout(undefined, "fi-FI").separator).toBe(".");
    expect(getDateLayout(undefined, "nb-NO").separator).toBe(".");
    expect(getDateLayout(undefined, "pl").separator).toBe(".");
    // Dutch writes 14-08-2026
    expect(getDateLayout(undefined, "nl").separator).toBe("-");
    // Slash stays the default for day- and month-first
    expect(getDateLayout(undefined, "en-GB").separator).toBe("/");
    expect(getDateLayout(undefined, "fr-FR").separator).toBe("/");
    // Japanese is year-first but slash-separated: 2026/08/14
    expect(getDateLayout(undefined, "ja-JP").separator).toBe("/");
    // Finland-Swedish is day-first with dots, unlike Sweden-Swedish
    expect(getDateLayout(undefined, "sv-FI").separator).toBe(".");
  });

  it("localizes placeholder tokens", () => {
    expect(getDateLayout(undefined, "de-DE").tokens).toEqual({
      day: "TT",
      month: "MM",
      year: "JJJJ",
    });
    expect(getDateLayout(undefined, "fr").tokens).toEqual({
      day: "JJ",
      month: "MM",
      year: "AAAA",
    });
    expect(getDateLayout(undefined, "sv-SE").tokens).toEqual({
      day: "DD",
      month: "MM",
      year: "ÅÅÅÅ",
    });
    expect(getDateLayout(undefined, "fi").tokens).toEqual({
      day: "PP",
      month: "KK",
      year: "VVVV",
    });
    // Unknown languages keep the English tokens
    expect(getDateLayout(undefined, "xx").tokens).toEqual({
      day: "DD",
      month: "MM",
      year: "YYYY",
    });
  });
});

describe("toIsoDate", () => {
  it("builds an ISO date from complete segments", () => {
    expect(toIsoDate({ year: "1985", month: "03", day: "15" })).toBe(
      "1985-03-15",
    );
  });

  it("pads single-digit segments", () => {
    expect(toIsoDate({ year: "1985", month: "3", day: "5" })).toBe(
      "1985-03-05",
    );
  });

  it("returns empty for incomplete input", () => {
    expect(toIsoDate({ year: "", month: "03", day: "15" })).toBe("");
    expect(toIsoDate({ year: "198", month: "03", day: "15" })).toBe("");
    expect(toIsoDate({ year: "1985", month: "", day: "15" })).toBe("");
  });

  it("returns empty for dates that do not exist", () => {
    expect(toIsoDate({ year: "1985", month: "02", day: "31" })).toBe("");
    expect(toIsoDate({ year: "1985", month: "13", day: "01" })).toBe("");
    expect(toIsoDate({ year: "1985", month: "00", day: "01" })).toBe("");
    expect(toIsoDate({ year: "1985", month: "04", day: "00" })).toBe("");
  });

  it("accepts 29 February only in leap years", () => {
    expect(toIsoDate({ year: "2024", month: "02", day: "29" })).toBe(
      "2024-02-29",
    );
    expect(toIsoDate({ year: "2023", month: "02", day: "29" })).toBe("");
    // 1900 is not a leap year; 2000 is
    expect(toIsoDate({ year: "1900", month: "02", day: "29" })).toBe("");
    expect(toIsoDate({ year: "2000", month: "02", day: "29" })).toBe(
      "2000-02-29",
    );
  });
});

describe("parseIsoDate", () => {
  it("splits a valid ISO value", () => {
    expect(parseIsoDate("1985-03-15")).toEqual({
      year: "1985",
      month: "03",
      day: "15",
    });
  });

  it("rejects anything else", () => {
    expect(parseIsoDate(undefined)).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("15/03/1985")).toBeNull();
    expect(parseIsoDate("1985-3-5")).toBeNull();
  });
});

describe("expandTwoDigitYear", () => {
  it("expands to the most recent matching year", () => {
    expect(expandTwoDigitYear("85", 2026)).toBe("1985");
    expect(expandTwoDigitYear("05", 2026)).toBe("2005");
    expect(expandTwoDigitYear("26", 2026)).toBe("2026");
    // Later this century than the anchor — must be the previous century
    expect(expandTwoDigitYear("27", 2026)).toBe("1927");
  });

  it("leaves anything that is not two digits alone", () => {
    expect(expandTwoDigitYear("1985", 2026)).toBe("1985");
    expect(expandTwoDigitYear("5", 2026)).toBe("5");
    expect(expandTwoDigitYear("", 2026)).toBe("");
  });
});

describe("resolveYearAnchor", () => {
  it("anchors on the field's max when it has one", () => {
    expect(resolveYearAnchor("2030-12-31", new Date("2026-08-12"))).toBe(2030);
  });

  it("anchors on the current year otherwise — the birthdate case", () => {
    expect(resolveYearAnchor(undefined, new Date("2026-08-12"))).toBe(2026);
    expect(resolveYearAnchor("not-a-date", new Date("2026-08-12"))).toBe(2026);
  });
});

describe("daysInMonth", () => {
  it("knows month lengths", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it("returns 0 for impossible months", () => {
    expect(daysInMonth(2026, 0)).toBe(0);
    expect(daysInMonth(2026, 13)).toBe(0);
  });
});
