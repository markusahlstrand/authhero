import { describe, it, expect } from "vitest";
import { findOrganizationForTenant } from "./orgLookup";

const orgs = [
  { id: "org_1", name: "acme-staging" },
  { id: "org_2", name: "acme" },
  { id: "org_3", name: "globex" },
];

describe("findOrganizationForTenant", () => {
  it("returns the org whose name equals the tenant id", () => {
    expect(findOrganizationForTenant(orgs, "globex")?.id).toBe("org_3");
  });

  it("matches exactly, never a similarly-named prefix", () => {
    // "acme" must resolve to the exact org, not "acme-staging"
    expect(findOrganizationForTenant(orgs, "acme")?.id).toBe("org_2");
  });

  it("matches case-insensitively when the tenant id differs in case", () => {
    expect(findOrganizationForTenant(orgs, "ACME")?.id).toBe("org_2");
  });

  it("matches case-insensitively when the org name differs in case", () => {
    expect(
      findOrganizationForTenant([{ id: "org_x", name: "Kvartal" }], "kvartal")
        ?.id,
    ).toBe("org_x");
  });

  it("returns undefined when no org matches", () => {
    expect(findOrganizationForTenant(orgs, "initech")).toBeUndefined();
  });

  it("ignores organizations without a name", () => {
    expect(
      findOrganizationForTenant<{ id: string; name?: string }>(
        [{ id: "org_y" }],
        "anything",
      ),
    ).toBeUndefined();
  });

  it("returns undefined for an empty list", () => {
    expect(findOrganizationForTenant([], "acme")).toBeUndefined();
  });
});
