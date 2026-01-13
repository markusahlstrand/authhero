import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("resourceServers - metadata", () => {
  it("should create a resource server with metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.resourceServers.create(tenant, {
      name: "Internal API",
      identifier: "https://internal-api.example.com",
      metadata: {
        sync: false,
        environment: "internal",
        team: "platform",
      },
    });

    expect(created).toBeDefined();
    expect(created.name).toBe("Internal API");
    expect(created.identifier).toBe("https://internal-api.example.com");
    expect(created.metadata).toBeDefined();
    expect(created.metadata?.sync).toBe(false);
    expect(created.metadata?.environment).toBe("internal");
    expect(created.metadata?.team).toBe("platform");
  });

  it("should get a resource server with metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.resourceServers.create(tenant, {
      name: "Test API",
      identifier: "https://test-api.example.com",
      metadata: { sync: false, version: "v1" },
    });

    const fetched = await adapters.resourceServers.get(tenant, created.id);
    expect(fetched?.metadata).toBeDefined();
    expect(fetched?.metadata?.sync).toBe(false);
    expect(fetched?.metadata?.version).toBe("v1");
  });

  it("should list resource servers with metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    await adapters.resourceServers.create(tenant, {
      name: "Public API",
      identifier: "https://public-api.example.com",
      metadata: { sync: true, visibility: "public" },
    });

    await adapters.resourceServers.create(tenant, {
      name: "Private API",
      identifier: "https://private-api.example.com",
    });

    const list = await adapters.resourceServers.list(tenant, {
      page: 0,
      per_page: 10,
      include_totals: true,
    });

    expect(list.resource_servers.length).toBe(2);

    const publicApi = list.resource_servers.find((r) => r.name === "Public API");
    expect(publicApi?.metadata?.sync).toBe(true);
    expect(publicApi?.metadata?.visibility).toBe("public");

    const privateApi = list.resource_servers.find(
      (r) => r.name === "Private API",
    );
    expect(privateApi?.metadata).toBeUndefined();
  });

  it("should update resource server metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.resourceServers.create(tenant, {
      name: "Updatable API",
      identifier: "https://updatable-api.example.com",
      metadata: { sync: true, revision: 1 },
    });

    // Update the metadata
    const updated = await adapters.resourceServers.update(tenant, created.id, {
      metadata: { sync: false, revision: 2, deprecated: true },
    });
    expect(updated).toBe(true);

    const fetched = await adapters.resourceServers.get(tenant, created.id);
    expect(fetched?.metadata?.sync).toBe(false);
    expect(fetched?.metadata?.revision).toBe(2);
    expect(fetched?.metadata?.deprecated).toBe(true);
  });

  it("should handle resource server without metadata", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.resourceServers.create(tenant, {
      name: "Simple API",
      identifier: "https://simple-api.example.com",
    });

    expect(created.metadata).toBeUndefined();

    const fetched = await adapters.resourceServers.get(tenant, created.id);
    expect(fetched?.metadata).toBeUndefined();
  });

  it("should preserve metadata along with other fields", async () => {
    const { data: adapters } = await getTestServer();
    const tenant = "test-tenant";

    const created = await adapters.resourceServers.create(tenant, {
      name: "Full API",
      identifier: "https://full-api.example.com",
      scopes: [{ value: "read:data", description: "Read data" }],
      token_lifetime: 3600,
      metadata: { sync: false, customKey: "customValue" },
    });

    expect(created.scopes).toHaveLength(1);
    expect(created.token_lifetime).toBe(3600);
    expect(created.metadata?.sync).toBe(false);
    expect(created.metadata?.customKey).toBe("customValue");

    const fetched = await adapters.resourceServers.get(tenant, created.id);
    expect(fetched?.scopes).toHaveLength(1);
    expect(fetched?.token_lifetime).toBe(3600);
    expect(fetched?.metadata?.sync).toBe(false);
  });
});
