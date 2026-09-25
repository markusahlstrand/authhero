import { describe, it, expect } from "vitest";
import {
  flattenDomainMetadata,
  transformForUpdate,
  unflattenDomainMetadata,
} from "./domainMetadataUtils";

describe("unflattenDomainMetadata", () => {
  it("nests dot-notation keys", () => {
    const result = unflattenDomainMetadata({
      domain_metadata: {
        "ssl.certificate_authority": "google",
        "ssl.method": "txt",
        region: "eu",
      },
    });
    expect(result.domain_metadata).toEqual({
      ssl: { certificate_authority: "google", method: "txt" },
      region: "eu",
    });
  });

  it("keeps other record fields untouched", () => {
    const result = unflattenDomainMetadata({
      domain: "auth.example.com",
      domain_metadata: { "a.b": "c" },
    });
    expect(result.domain).toBe("auth.example.com");
  });

  it("returns the record as-is when domain_metadata is missing or not an object", () => {
    const noMeta = { domain: "x" };
    expect(unflattenDomainMetadata(noMeta)).toBe(noMeta);
    const stringMeta = { domain_metadata: "oops" };
    expect(unflattenDomainMetadata(stringMeta)).toBe(stringMeta);
    const nullMeta = { domain_metadata: null };
    expect(unflattenDomainMetadata(nullMeta)).toBe(nullMeta);
  });

  it("handles an empty metadata object", () => {
    const result = unflattenDomainMetadata({ domain_metadata: {} });
    expect(result.domain_metadata).toEqual({});
  });

  it("drops keys that would pollute the prototype", () => {
    const result = unflattenDomainMetadata({
      domain_metadata: {
        "__proto__.polluted": "yes",
        "a.constructor.b": "yes",
        "prototype.x": "yes",
        ok: "fine",
      },
    });
    expect(result.domain_metadata).toEqual({ ok: "fine" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("does not mutate the input", () => {
    const input = { domain_metadata: { "a.b": "c" } };
    unflattenDomainMetadata(input);
    expect(input).toEqual({ domain_metadata: { "a.b": "c" } });
  });
});

describe("flattenDomainMetadata", () => {
  it("flattens nested objects to dot-notation keys", () => {
    const result = flattenDomainMetadata({
      domain_metadata: {
        ssl: { certificate_authority: "google", deep: { level: "3" } },
        region: "eu",
      },
    });
    expect(result.domain_metadata).toEqual({
      "ssl.certificate_authority": "google",
      "ssl.deep.level": "3",
      region: "eu",
    });
  });

  it("drops undefined, null and empty-string leaves", () => {
    const result = flattenDomainMetadata({
      domain_metadata: { a: undefined, b: null, c: "", d: "keep" },
    });
    expect(result.domain_metadata).toEqual({ d: "keep" });
  });

  it("stringifies non-string leaves", () => {
    const result = flattenDomainMetadata({
      domain_metadata: { n: 5, flag: false, zero: 0 },
    });
    expect(result.domain_metadata).toEqual({
      n: "5",
      flag: "false",
      zero: "0",
    });
  });

  it("treats arrays as leaves rather than recursing", () => {
    const result = flattenDomainMetadata({
      domain_metadata: { list: ["a", "b"] },
    });
    expect(result.domain_metadata).toEqual({ list: "a,b" });
  });

  it("returns the record as-is when domain_metadata is missing or not an object", () => {
    const noMeta = { domain: "x" };
    expect(flattenDomainMetadata(noMeta)).toBe(noMeta);
    const undef = { domain_metadata: undefined };
    expect(flattenDomainMetadata(undef)).toBe(undef);
    const stringMeta = { domain_metadata: "oops" };
    expect(flattenDomainMetadata(stringMeta)).toBe(stringMeta);
  });

  it("handles an empty metadata object", () => {
    const result = flattenDomainMetadata({ domain_metadata: {} });
    expect(result.domain_metadata).toEqual({});
  });

  it("skips prototype-polluting keys", () => {
    const nested = JSON.parse(
      '{"__proto__": {"polluted": "yes"}, "constructor": "x", "ok": "fine"}',
    );
    const result = flattenDomainMetadata({ domain_metadata: nested });
    expect(result.domain_metadata).toEqual({ ok: "fine" });
  });
});

describe("round trip", () => {
  it("unflatten then flatten restores the original flat metadata", () => {
    const flat = {
      "ssl.certificate_authority": "google",
      "ssl.method": "txt",
      "a.b.c.d": "deep",
      region: "eu",
    };
    const nested = unflattenDomainMetadata({ domain_metadata: flat });
    const back = flattenDomainMetadata(nested);
    expect(back.domain_metadata).toEqual(flat);
  });

  it("flatten then unflatten restores the original nested metadata", () => {
    const nested = { ssl: { certificate_authority: "google" }, region: "eu" };
    const flat = flattenDomainMetadata({ domain_metadata: nested });
    const back = unflattenDomainMetadata(flat);
    expect(back.domain_metadata).toEqual(nested);
  });
});

describe("transformForUpdate", () => {
  it("keeps only fields accepted by PATCH and flattens domain_metadata", () => {
    const result = transformForUpdate({
      custom_domain_id: "cd_1",
      domain: "auth.example.com",
      status: "ready",
      verification: { methods: [] },
      tls_policy: "recommended",
      custom_client_ip_header: "cf-connecting-ip",
      domain_metadata: { ssl: { certificate_authority: "google" } },
    });
    expect(result).toEqual({
      tls_policy: "recommended",
      custom_client_ip_header: "cf-connecting-ip",
      domain_metadata: { "ssl.certificate_authority": "google" },
    });
  });

  it("omits allowed fields that are absent from the record", () => {
    const result = transformForUpdate({
      domain: "auth.example.com",
      tls_policy: "modern",
    });
    expect(result).toEqual({ tls_policy: "modern" });
    expect("domain_metadata" in result).toBe(false);
  });

  it("returns an empty object when nothing is updatable", () => {
    expect(transformForUpdate({ domain: "x", status: "ready" })).toEqual({});
    expect(transformForUpdate({})).toEqual({});
  });
});
