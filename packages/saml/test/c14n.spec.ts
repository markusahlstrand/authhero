import { describe, expect, it } from "vitest";
import { canonicalize } from "../src/canonicalize";

describe("c14n", () => {
  it("should remove blankspace at the end of a self closing tag", () => {
    const xml = `<root />`;
    const result = canonicalize(xml);
    expect(result).toBe(`<root/>`);
  });

  it("should remove comments", () => {
    const xml = `<root><!-- & --></root>`;
    const result = canonicalize(xml);
    expect(result).toBe(`<root/>`);
  });

  describe("escaping", () => {
    it("should escape entities in attributes", () => {
      const xml = `<root attribute="&"><child>value</child></root>`;
      const result = canonicalize(xml);
      expect(result).toBe(
        `<root attribute="&amp;"><child>value</child></root>`,
      );
    });

    it("should escape entities in text", () => {
      const xml = `<root><child>&</child></root>`;
      const result = canonicalize(xml);
      expect(result).toBe(`<root><child>&amp;</child></root>`);
    });
  });

  describe("nodes", () => {
    it("should order child nodes", () => {
      const xml = `<root><b /><a /></root>`;
      const result = canonicalize(xml);
      expect(result).toBe(`<root><a/><b/></root>`);
    });

    it("should handle multiple text nodes", () => {
      const xml = `<root>text1<child/>text2<child/>text3</root>`;
      const result = canonicalize(xml);
      expect(result).toBe(`<root>text1<child/>text2<child/>text3</root>`);
    });
  });

  describe("attributes", () => {
    it("should order attributes", () => {
      const xml = `<root b="2" a="1" />`;
      const result = canonicalize(xml);
      expect(result).toBe(`<root a="1" b="2"/>`);
    });

    it("should should sort attrinbutes with upper case attributes before lower case attributes", () => {
      const xml = `<root B="2" a="1" />`;
      const result = canonicalize(xml);
      expect(result).toBe(`<root a="1" B="2"/>`);
    });

    it("should sort attributes with namespaces first", () => {
      const xml = `<root xmlns="http://example.com" a="1" />`;
      const result = canonicalize(xml);
      expect(result).toBe(`<root xmlns="http://example.com" a="1"/>`);
    });
  });

  it("should handle default namespace declarations", () => {
    const xml = `<root xmlns="http://default.com"><child/></root>`;
    const result = canonicalize(xml);
    expect(result).toBe(`<root xmlns="http://default.com"><child/></root>`);
  });

  it("should order prefixed namespace declarations", () => {
    const xml = `<root xmlns:b="http://b.com" xmlns:a="http://a.com"/>`;
    const result = canonicalize(xml);
    expect(result).toBe(
      `<root xmlns:a="http://a.com" xmlns:b="http://b.com"/>`,
    );
  });

  it("should handle mixed content", () => {
    const xml = `<root>text1<child/>text2</root>`;
    const result = canonicalize(xml);
    expect(result).toBe(`<root>text1<child/>text2</root>`);
  });

  it("should normalize attribute values", () => {
    const xml = `<root attr="  value  "/>`;
    const result = canonicalize(xml);
    expect(result).toBe(`<root attr="  value  "/>`);
  });

  it("should handle CDATA sections", () => {
    const xml = `<root><![CDATA[<text>]]></root>`;
    const result = canonicalize(xml);
    expect(result).toBe(`<root>&lt;text&gt;</root>`);
  });

  it("should handle processing instructions", () => {
    const xml = `<?xml-stylesheet href="style.css"?><root/>`;
    const result = canonicalize(xml);
    expect(result).toBe(`<?xml-stylesheet href="style.css"?><root/>`);
  });

  it("should handle empty elements with namespaces", () => {
    const xml = `<root><ns:child xmlns:ns="http://example.com"/></root>`;
    const result = canonicalize(xml);
    expect(result).toBe(
      `<root><ns:child xmlns:ns="http://example.com"/></root>`,
    );
  });

  it("should handle default namespace with prefixed element", () => {
    const xml = `<root xmlns="http://default.com" xmlns:p="http://prefix.com"><p:child/></root>`;
    const result = canonicalize(xml);
    expect(result).toBe(
      `<root xmlns="http://default.com" xmlns:p="http://prefix.com"><p:child/></root>`,
    );
  });
});
