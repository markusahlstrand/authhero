import { describe, it, expect } from "vitest";
import {
  isIpMatch,
  isIPv4,
  isIPv6,
  normalizeIp,
  stripPort,
} from "../../src/utils/ip";

// IPv4 tests
describe("isIpMatch - IPv4", () => {
  it("should match identical IPv4 addresses", () => {
    expect(isIpMatch("192.168.1.1", "192.168.1.1")).toBe(true);
  });
  it("should not match different IPv4 addresses", () => {
    expect(isIpMatch("192.168.1.1", "192.168.1.2")).toBe(false);
  });
});

// IPv6 tests
describe("isIpMatch - IPv6", () => {
  it("should match identical full IPv6 addresses", () => {
    expect(
      isIpMatch(
        "2001:db8:85a3:0:0:8a2e:370:7334",
        "2001:db8:85a3:0:0:8a2e:370:7334",
      ),
    ).toBe(true);
  });
  it("should match if first 4 segments are the same with a strict false flag", () => {
    expect(
      isIpMatch(
        "2001:db8:85a3:0:1234:5678:9abc:def0",
        "2001:db8:85a3:0:abcd:ef01:2345:6789",
        false,
      ),
    ).toBe(true);
  });
  it("should not match if first 4 segments differ", () => {
    expect(
      isIpMatch(
        "2001:db8:85a3:1:abcd:ef01:2345:6789",
        "2001:db8:85a3:0:abcd:ef01:2345:6789",
      ),
    ).toBe(false);
  });
  it("should not match when IPv6 addresses differ after compression", () => {
    expect(isIpMatch("2001:db8::", "2001:db8::1")).toBe(false);
  });
});

// Mixed/invalid input
describe("isIpMatch - edge cases", () => {
  it("should return false for empty input", () => {
    expect(isIpMatch("", "")).toBe(false);
  });
  it("should return false for IPv4 vs IPv6", () => {
    expect(isIpMatch("192.168.1.1", "::1")).toBe(false);
  });
  it("should not treat IPv4 with port as IPv6", () => {
    expect(isIpMatch("127.0.0.1:3000", "127.0.0.1")).toBe(true);
    expect(isIpMatch("127.0.0.1", "127.0.0.1:3000")).toBe(true);
  });
  it("should not treat single colon as IPv6", () => {
    expect(isIpMatch("foo:bar", "foo:bar")).toBe(false);
  });
  it("should handle IPv6 in square brackets", () => {
    expect(isIpMatch("[::1]", "::1")).toBe(true);
    expect(isIpMatch("::1", "[::1]")).toBe(true);
    expect(
      isIpMatch(
        "[2001:db8:85a3::8a2e:370:7334]",
        "2001:db8:85a3::8a2e:370:7334",
      ),
    ).toBe(true);
  });
});

// isIPv4 tests
describe("isIPv4", () => {
  it("should return true for valid IPv4 addresses", () => {
    expect(isIPv4("192.168.1.1")).toBe(true);
    expect(isIPv4("0.0.0.0")).toBe(true);
    expect(isIPv4("255.255.255.255")).toBe(true);
  });
  it("should return false for invalid IPv4 addresses", () => {
    expect(isIPv4("256.0.0.1")).toBe(false);
    expect(isIPv4("192.168.1")).toBe(false);
    expect(isIPv4("192.168.1.1.1")).toBe(false);
    expect(isIPv4("abc.def.ghi.jkl")).toBe(false);
    expect(isIPv4("")).toBe(false);
    expect(isIPv4("::1")).toBe(false);
  });
});

// isIPv6 tests
describe("isIPv6", () => {
  it("should return true for valid IPv6 addresses", () => {
    expect(isIPv6("::1")).toBe(true);
    expect(isIPv6("2001:db8:85a3:0:0:8a2e:370:7334")).toBe(true);
    expect(isIPv6("fe80::1%lo0")).toBe(true);
    expect(isIPv6("2001:db8::1")).toBe(true);
  });
  it("should return false for invalid IPv6 addresses", () => {
    expect(isIPv6("192.168.1.1")).toBe(false);
    expect(isIPv6("abcd")).toBe(false);
    expect(isIPv6("")).toBe(false);
    expect(isIPv6("foo:bar")).toBe(false);
    expect(isIPv6("2001:db8:85a3:0:0:8a2e:370:7334:1234:5678")).toBe(false);
  });
});

// normalizeIp tests
describe("normalizeIp", () => {
  it("should normalize valid IPv4 addresses", () => {
    expect(normalizeIp("192.168.1.1")).toEqual({
      family: 4,
      normalized: "192.168.1.1",
    });
    expect(normalizeIp("  10.0.0.1  ")).toEqual({
      family: 4,
      normalized: "10.0.0.1",
    });
    expect(normalizeIp("127.0.0.1")).toEqual({
      family: 4,
      normalized: "127.0.0.1",
    });
  });
  it("should normalize valid IPv6 addresses", () => {
    expect(normalizeIp("::1")).toEqual({ family: 6, normalized: "::1" });
    expect(normalizeIp("[::1]")).toEqual({ family: 6, normalized: "::1" });
    expect(normalizeIp("fe80::1%lo0")).toEqual({
      family: 6,
      normalized: "fe80::1",
    });
    expect(normalizeIp("2001:db8:85a3:0:0:8a2e:370:7334")).toEqual({
      family: 6,
      normalized: "2001:db8:85a3:0:0:8a2e:370:7334",
    });
    expect(normalizeIp("[2001:db8:85a3::8a2e:370:7334]")).toEqual({
      family: 6,
      normalized: "2001:db8:85a3::8a2e:370:7334",
    });
  });
  it("should return null for invalid IPs", () => {
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp("foo:bar")).toBeNull();
    expect(normalizeIp("256.0.0.1")).toBeNull();
    expect(normalizeIp("abcd")).toBeNull();
    expect(normalizeIp("192.168.1")).toBeNull();
    expect(normalizeIp("2001:db8:85a3:0:0:8a2e:370:7334:1234:5678")).toBeNull();
  });
});

// stripPort tests
describe("stripPort", () => {
  it("should remove port from IPv4 address", () => {
    expect(stripPort("127.0.0.1:3000")).toBe("127.0.0.1");
    expect(stripPort("192.168.1.1:8080")).toBe("192.168.1.1");
  });
  it("should not modify IPv4 address without port", () => {
    expect(stripPort("127.0.0.1")).toBe("127.0.0.1");
  });
  it("should remove port from bracketed IPv6 address", () => {
    expect(stripPort("[::1]:3000")).toBe("::1");
    expect(stripPort("[2001:db8::1]:443")).toBe("2001:db8::1");
  });
  it("should not remove anything from plain IPv6 address", () => {
    expect(stripPort("2001:db8::1")).toBe("2001:db8::1");
    expect(stripPort("::1")).toBe("::1");
  });
  it("should handle extra whitespace", () => {
    expect(stripPort(" 127.0.0.1:3000 ")).toBe("127.0.0.1");
    expect(stripPort(" [::1]:3000 ")).toBe("::1");
  });
  it("should not remove port-like suffix from non-IP string", () => {
    expect(stripPort("foo:bar")).toBe("foo:bar");
  });
});
