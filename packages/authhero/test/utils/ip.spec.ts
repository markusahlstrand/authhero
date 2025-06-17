import { describe, it, expect } from "vitest";
import { isIpMatch } from "../../src/utils/ip";

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
  it("should match if first 4 segments are the same (current logic)", () => {
    expect(
      isIpMatch(
        "2001:db8:85a3:0:1234:5678:9abc:def0",
        "2001:db8:85a3:0:abcd:ef01:2345:6789",
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
});

// Mixed/invalid input
describe("isIpMatch - edge cases", () => {
  it("should return false for empty input", () => {
    expect(isIpMatch("", "")).toBe(false);
  });
  it("should return false for IPv4 vs IPv6", () => {
    expect(isIpMatch("192.168.1.1", "::1")).toBe(false);
  });
});
