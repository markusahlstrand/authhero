import { describe, it, expect } from "vitest";
import { samlResponseForm } from "../../src/strategies/saml";

async function bodyText(res: Response): Promise<string> {
  return await res.text();
}

describe("samlResponseForm — auto-submit HTML escaping", () => {
  it("escapes a RelayState payload that tries to break out of the attribute", async () => {
    const malicious = `" autofocus onfocus="alert(1)`;
    const html = await bodyText(
      samlResponseForm("https://sp.example.com/acs", "BASE64SAMLRESPONSE", malicious),
    );

    // The raw payload must NOT appear unescaped in the HTML.
    expect(html).not.toContain(`value="" autofocus onfocus="alert(1)"`);
    // The escaped form should appear, neutralized inside the attribute.
    expect(html).toContain("&quot; autofocus onfocus=&quot;alert(1)");
    // The auto-submit form must still render and be auto-submitting.
    expect(html).toContain('action="https://sp.example.com/acs"');
    expect(html).toContain('name="RelayState"');
  });

  it("escapes the post URL when it contains attribute-breaking chars", async () => {
    const html = await bodyText(
      samlResponseForm(
        `https://sp.example.com/acs" onsubmit="alert(1)`,
        "BASE64",
        undefined,
      ),
    );

    expect(html).not.toContain(`onsubmit="alert(1)"`);
    expect(html).toContain("&quot; onsubmit=&quot;alert(1)");
  });

  it("renders no RelayState input when none is supplied", async () => {
    const html = await bodyText(
      samlResponseForm("https://sp.example.com/acs", "BASE64", undefined),
    );

    expect(html).not.toContain('name="RelayState"');
    expect(html).toContain('action="https://sp.example.com/acs"');
  });

  it("base64 SAMLResponse passes through unchanged inside the value attribute", async () => {
    // base64 charset is [A-Za-z0-9+/=] — none of these are HTML-attribute-
    // breaking, but the function still runs the escape defensively. Verify
    // the original base64 string is preserved (`=` and `+` aren't escaped).
    const sample = "abcXYZ+/0123==";
    const html = await bodyText(
      samlResponseForm("https://sp.example.com/acs", sample, undefined),
    );
    expect(html).toContain(`value="${sample}"`);
  });
});
