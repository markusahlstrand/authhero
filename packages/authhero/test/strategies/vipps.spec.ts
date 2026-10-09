import { describe, it, expect } from "vitest";
import { normalizeVippsPhoneNumber } from "../../src/strategies/vipps";

describe("normalizeVippsPhoneNumber", () => {
  it("adds the leading + to a bare MSISDN", () => {
    expect(normalizeVippsPhoneNumber("4745057395")).toEqual("+4745057395");
  });

  it("leaves a number that is already E.164 untouched", () => {
    expect(normalizeVippsPhoneNumber("+4745057395")).toEqual("+4745057395");
  });

  it("leaves anything that isn't all digits untouched", () => {
    expect(normalizeVippsPhoneNumber("47 45 05 73 95")).toEqual(
      "47 45 05 73 95",
    );
  });
});
