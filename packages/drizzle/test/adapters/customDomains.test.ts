import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

const VERIFICATION = {
  methods: [
    {
      name: "txt" as const,
      record: "record-value",
      domain: "_acme.example.com",
    },
  ],
};

async function seed() {
  const { data } = getTestServer();
  await data.tenants.create({
    id: "tenantId",
    friendly_name: "Test Tenant",
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });
  const created = await data.customDomains.create("tenantId", {
    domain: "login.example.com",
    type: "auth0_managed_certs",
  });
  return { data, id: created.custom_domain_id };
}

describe("drizzle customDomains", () => {
  // `verification` is a text column. Writing the object straight through made
  // SQLite reject the whole statement ("Too few parameter values were
  // provided"), so a domain could never be promoted to `ready` at all.
  it("round-trips verification through update and get", async () => {
    const { data, id } = await seed();

    await data.customDomains.update("tenantId", id, {
      status: "ready",
      verification: VERIFICATION,
    });

    const stored = await data.customDomains.get("tenantId", id);
    expect(stored?.status).toBe("ready");
    expect(stored?.verification).toEqual(VERIFICATION);
  });

  it("returns verification parsed from getByDomain and list too", async () => {
    const { data, id } = await seed();
    await data.customDomains.update("tenantId", id, {
      verification: VERIFICATION,
    });

    const byDomain = await data.customDomains.getByDomain("login.example.com");
    expect(byDomain?.verification).toEqual(VERIFICATION);

    const [listed] = await data.customDomains.list("tenantId");
    expect(listed?.verification).toEqual(VERIFICATION);
  });
});
