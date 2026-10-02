import { describe, it, expect } from "vitest";
import { extractLoginAttribution } from "../../src/utils/login-attribution";

const BASE = "https://auth.example.com/authorize?client_id=c";

describe("extractLoginAttribution", () => {
  it("keeps utm_* and click ids, and nothing else", () => {
    expect(
      extractLoginAttribution(
        `${BASE}&utm_source=newsletter&utm_content=hero&gclid=g&fbclid=f&msclkid=m` +
          "&login_hint=a%40b.com&state=s&nonce=n&redirect_uri=https%3A%2F%2Fx",
      ),
    ).toEqual({
      utm_source: "newsletter",
      utm_content: "hero",
      gclid: "g",
      fbclid: "f",
      msclkid: "m",
    });
  });

  it("returns undefined when there is nothing to record", () => {
    expect(extractLoginAttribution(`${BASE}&login_hint=a%40b.com`)).toBe(
      undefined,
    );
    expect(extractLoginAttribution(`${BASE}&utm_source=`)).toBe(undefined);
    expect(extractLoginAttribution(`${BASE}&utm_=x`)).toBe(undefined);
    expect(extractLoginAttribution(undefined)).toBe(undefined);
    expect(extractLoginAttribution("/relative?utm_source=x")).toBe(undefined);
  });

  it("decodes values, lowercases names and keeps the first of a repeated parameter", () => {
    expect(
      extractLoginAttribution(
        `${BASE}&UTM_Source=spring%20sale&utm_source=second`,
      ),
    ).toEqual({ utm_source: "spring sale" });
  });

  it("bounds value length and parameter count", () => {
    const longValue = "x".repeat(500);
    const many = Array.from({ length: 20 }, (_, i) => `utm_p${i}=v${i}`).join(
      "&",
    );

    expect(
      extractLoginAttribution(`${BASE}&utm_source=${longValue}`)?.utm_source,
    ).toHaveLength(128);
    expect(
      Object.keys(extractLoginAttribution(`${BASE}&${many}`) ?? {}),
    ).toHaveLength(10);
    expect(extractLoginAttribution(`${BASE}&utm_${"a".repeat(40)}=x`)).toBe(
      undefined,
    );
  });
});
