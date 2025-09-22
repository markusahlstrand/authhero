import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("resourceServers adapter - property persistence", () => {
  it("should persist allow_offline_access and enforce_policies properties correctly", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "t1";

    // Create a resource server with initial values
    const created = await adapters.resourceServers.create(tenant, {
      name: "Test API",
      identifier: "https://api.test.com/",
      scopes: [{ value: "read:data", description: "Read data" }],
      signing_alg: "RS256",
      token_lifetime: 3600,
      allow_offline_access: false,
      options: {
        enforce_policies: false,
      },
    } as any);

    expect(created.id).toBeTruthy();

    // Verify initial values
    const initial = await adapters.resourceServers.get(tenant, created.id!);
    expect(initial?.allow_offline_access).toBe(false);
    expect(initial?.options?.enforce_policies).toBe(false);

    // Update both properties to true
    const updated = await adapters.resourceServers.update(tenant, created.id!, {
      allow_offline_access: true,
      options: {
        enforce_policies: true,
      },
    });
    expect(updated).toBe(true);

    // Verify both properties were updated correctly
    const afterUpdate = await adapters.resourceServers.get(tenant, created.id!);
    expect(afterUpdate?.allow_offline_access).toBe(true);
    expect(afterUpdate?.options?.enforce_policies).toBe(true);

    // Update only allow_offline_access back to false, should preserve enforce_policies
    const updated2 = await adapters.resourceServers.update(
      tenant,
      created.id!,
      {
        allow_offline_access: false,
      },
    );
    expect(updated2).toBe(true);

    const afterUpdate2 = await adapters.resourceServers.get(
      tenant,
      created.id!,
    );
    expect(afterUpdate2?.allow_offline_access).toBe(false);
    expect(afterUpdate2?.options?.enforce_policies).toBe(true); // Should still be true

    // Update only enforce_policies back to false, should preserve allow_offline_access
    const updated3 = await adapters.resourceServers.update(
      tenant,
      created.id!,
      {
        options: {
          enforce_policies: false,
        },
      },
    );
    expect(updated3).toBe(true);

    const afterUpdate3 = await adapters.resourceServers.get(
      tenant,
      created.id!,
    );
    expect(afterUpdate3?.allow_offline_access).toBe(false); // Should still be false
    expect(afterUpdate3?.options?.enforce_policies).toBe(false);

    // Clean up
    await adapters.resourceServers.remove(tenant, created.id!);
  });

  it("should handle partial options updates correctly", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "t1";

    // Create a resource server with multiple options
    const created = await adapters.resourceServers.create(tenant, {
      name: "Test API 2",
      identifier: "https://api2.test.com/",
      options: {
        enforce_policies: true,
        allow_skipping_userinfo: true,
        persist_client_authorization: false,
      },
    } as any);

    expect(created.id).toBeTruthy();

    // Verify initial values
    const initial = await adapters.resourceServers.get(tenant, created.id!);
    expect(initial?.options?.enforce_policies).toBe(true);
    expect(initial?.options?.allow_skipping_userinfo).toBe(true);
    expect(initial?.options?.persist_client_authorization).toBe(false);

    // Update only enforce_policies, should preserve other options
    const updated = await adapters.resourceServers.update(tenant, created.id!, {
      options: {
        enforce_policies: false,
        // Note: Not setting other options here
      },
    });
    expect(updated).toBe(true);

    const afterUpdate = await adapters.resourceServers.get(tenant, created.id!);
    expect(afterUpdate?.options?.enforce_policies).toBe(false);
    // These should be preserved from the original creation (not overwritten)
    expect(afterUpdate?.options?.allow_skipping_userinfo).toBe(true);
    expect(afterUpdate?.options?.persist_client_authorization).toBe(false);

    // Clean up
    await adapters.resourceServers.remove(tenant, created.id!);
  });
});
