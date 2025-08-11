import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("resourceServers adapter", () => {
  it("should create, get, list, update and remove a resource server", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "t1";

    const created = await adapters.resourceServers.create(tenant, {
      name: "My API",
      identifier: "https://api.example.com/",
      scopes: [{ value: "read:foo", description: "Read foo" }],
      signing_alg: "RS256",
      token_lifetime: 3600,
      skip_consent_for_verifiable_first_party_clients: true,
      allow_offline_access: false,
      options: { allow_opaque_access_tokens: true },
    } as any);

    expect(created.id).toBeTruthy();

    const fetched = await adapters.resourceServers.get(tenant, created.id);
    expect(fetched?.identifier).toBe("https://api.example.com/");
    expect(fetched?.scopes?.[0]?.value).toBe("read:foo");
    expect(fetched?.skip_consent_for_verifiable_first_party_clients).toBe(true);

    const list = await adapters.resourceServers.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
      q: "name:My",
    });
    expect(list.resource_servers.length).toBe(1);

    const updated = await adapters.resourceServers.update(tenant, created.id, {
      name: "My API v2",
      options: { allow_opaque_access_tokens: false },
    });
    expect(updated).toBe(true);

    const fetched2 = await adapters.resourceServers.get(tenant, created.id);
    expect(fetched2?.name).toBe("My API v2");
    expect(fetched2?.options?.allow_opaque_access_tokens).toBe(false);

    const removed = await adapters.resourceServers.remove(tenant, created.id);
    expect(removed).toBe(true);

    const afterDelete = await adapters.resourceServers.get(tenant, created.id);
    expect(afterDelete).toBeNull();
  });
});
