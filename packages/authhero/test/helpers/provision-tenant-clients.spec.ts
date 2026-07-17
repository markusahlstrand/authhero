import { describe, it, expect } from "vitest";
import { getTestServer } from "./test-server";
import {
  provisionDefaultClients,
  isInteractiveClient,
} from "../../src/helpers/provision-tenant-clients";
import { MANAGEMENT_API_SCOPES } from "../../src/seed";

const MANAGEMENT_AUDIENCE = "urn:authhero:management";

describe("isInteractiveClient", () => {
  it("treats clients with no explicit grant_types as interactive", () => {
    expect(isInteractiveClient({})).toBe(true);
    expect(isInteractiveClient({ grant_types: [] })).toBe(true);
  });

  it("treats authorization_code / implicit clients as interactive", () => {
    expect(isInteractiveClient({ grant_types: ["authorization_code"] })).toBe(
      true,
    );
    expect(isInteractiveClient({ grant_types: ["implicit"] })).toBe(true);
  });

  it("treats client_credentials-only and non_interactive clients as M2M", () => {
    expect(isInteractiveClient({ grant_types: ["client_credentials"] })).toBe(
      false,
    );
    expect(
      isInteractiveClient({
        app_type: "non_interactive",
        grant_types: ["authorization_code"],
      }),
    ).toBe(false);
  });
});

describe("provisionDefaultClients", () => {
  it("points default_client_id at the existing interactive client and provisions an M2M client", async () => {
    const { env } = await getTestServer();

    const result = await provisionDefaultClients(env.data, "tenantId", {
      managementApiIdentifier: MANAGEMENT_AUDIENCE,
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });

    // Reuses the test server's interactive "clientId" rather than creating one.
    expect(result.defaultClientId).toBe("clientId");
    const tenant = await env.data.tenants.get("tenantId");
    expect(tenant!.default_client_id).toBe("clientId");

    // M2M client + grant were created.
    expect(result.managementClientId).toBeDefined();
    const m2m = await env.data.clients.get(
      "tenantId",
      result.managementClientId!,
    );
    expect(m2m!.app_type).toBe("non_interactive");
    const { client_grants } = await env.data.clientGrants.list("tenantId", {});
    const grant = client_grants.find(
      (g) => g.client_id === result.managementClientId,
    );
    expect(grant?.audience).toBe(MANAGEMENT_AUDIENCE);
  });

  it("is idempotent — re-running does not duplicate clients, grants, or clobber the default", async () => {
    const { env } = await getTestServer();

    const snapshotClients = () =>
      env.data.clients
        .list("tenantId", { per_page: 100 })
        .then(({ clients }) => clients.map((c) => c.client_id).sort());
    const snapshotGrants = () =>
      env.data.clientGrants
        .list("tenantId", { per_page: 100 })
        .then(({ client_grants }) =>
          client_grants.map((g) => `${g.client_id}:${g.audience}`).sort(),
        );

    const first = await provisionDefaultClients(env.data, "tenantId", {
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });
    const clientsAfterFirst = await snapshotClients();
    const grantsAfterFirst = await snapshotGrants();

    const second = await provisionDefaultClients(env.data, "tenantId", {
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });
    const clientsAfterSecond = await snapshotClients();
    const grantsAfterSecond = await snapshotGrants();

    expect(second.defaultClientId).toBe(first.defaultClientId);
    expect(second.managementClientId).toBe(first.managementClientId);
    // Compare the full client and grant sets, not just counts, so a duplicate
    // grant (or churned client) would be caught.
    expect(clientsAfterSecond).toEqual(clientsAfterFirst);
    expect(grantsAfterSecond).toEqual(grantsAfterFirst);
  });

  it("recreates the management grant when reusing a management client that lost it", async () => {
    const { env } = await getTestServer();

    // Simulate a partial seed: the management client exists but its grant is
    // missing, so it can't mint Management API tokens.
    const orphan = await env.data.clients.create("tenantId", {
      client_id: "orphanManagement",
      client_secret: "s",
      name: "API Explorer Application",
      app_type: "non_interactive",
      grant_types: ["client_credentials"],
    });

    const result = await provisionDefaultClients(env.data, "tenantId", {
      managementApiIdentifier: MANAGEMENT_AUDIENCE,
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });

    // Reuses the existing client rather than creating a second one.
    expect(result.managementClientId).toBe(orphan.client_id);
    const { client_grants } = await env.data.clientGrants.list("tenantId", {
      per_page: 100,
    });
    const grant = client_grants.find((g) => g.client_id === orphan.client_id);
    expect(grant?.audience).toBe(MANAGEMENT_AUDIENCE);
  });

  it("respects an already-configured, valid default_client_id without creating a replacement", async () => {
    const { env } = await getTestServer();
    await env.data.clients.create("tenantId", {
      client_id: "preferred",
      client_secret: "s",
      name: "Preferred",
      grant_types: ["authorization_code"],
    });
    await env.data.tenants.update("tenantId", {
      default_client_id: "preferred",
    });
    const { clients: before } = await env.data.clients.list("tenantId", {
      per_page: 100,
    });

    const result = await provisionDefaultClients(env.data, "tenantId", {
      createManagementClient: false,
    });

    expect(result.defaultClientId).toBe("preferred");
    // No replacement default client was created and the pointer is unchanged.
    const { clients: after } = await env.data.clients.list("tenantId", {
      per_page: 100,
    });
    expect(after.map((c) => c.client_id).sort()).toEqual(
      before.map((c) => c.client_id).sort(),
    );
    const tenant = await env.data.tenants.get("tenantId");
    expect(tenant!.default_client_id).toBe("preferred");
  });

  it("creates a Default App when the tenant has no interactive client", async () => {
    const { env } = await getTestServer();
    await env.data.tenants.create({
      id: "freshTenant",
      friendly_name: "Fresh",
      audience: "urn:authhero:tenant:freshTenant",
      sender_email: "noreply@example.com",
      sender_name: "AuthHero",
    });
    // Only an M2M client exists — must NOT be chosen as the default.
    await env.data.clients.create("freshTenant", {
      client_id: "onlyM2m",
      client_secret: "s",
      name: "Only M2M",
      app_type: "non_interactive",
      grant_types: ["client_credentials"],
    });

    const result = await provisionDefaultClients(env.data, "freshTenant", {
      createManagementClient: false,
    });

    expect(result.defaultClientId).not.toBe("onlyM2m");
    const created = await env.data.clients.get(
      "freshTenant",
      result.defaultClientId,
    );
    expect(created!.name).toBe("Default App");
    expect(isInteractiveClient(created!)).toBe(true);
    const tenant = await env.data.tenants.get("freshTenant");
    expect(tenant!.default_client_id).toBe(result.defaultClientId);
  });
});
