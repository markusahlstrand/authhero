import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("clients create importMetadata", () => {
  it("preserves the supplied id and timestamps on import", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const created_at = "2020-01-02T03:04:05.000Z";
    const updated_at = "2021-06-07T08:09:10.000Z";

    const created = await data.clients.create(
      "tenantId",
      { name: "Imported Client" },
      { importMetadata: { id: "imported-client", created_at, updated_at } },
    );

    expect(created.client_id).toBe("imported-client");
    expect(created.created_at).toBe(created_at);
    expect(created.updated_at).toBe(updated_at);

    const fetched = await data.clients.get("tenantId", "imported-client");
    expect(fetched?.client_id).toBe("imported-client");
    expect(fetched?.created_at).toBe(created_at);
    expect(fetched?.updated_at).toBe(updated_at);
  });

  it("generates id and timestamps when no importMetadata is given", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const before = Date.now();
    const created = await data.clients.create("tenantId", {
      name: "Normal Client",
    });
    const after = Date.now();

    expect(created.client_id).toBeTruthy();
    const createdMs = new Date(created.created_at).getTime();
    expect(createdMs).toBeGreaterThanOrEqual(before);
    expect(createdMs).toBeLessThanOrEqual(after);
  });
});
