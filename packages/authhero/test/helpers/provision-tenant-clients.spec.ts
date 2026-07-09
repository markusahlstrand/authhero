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

  it("is idempotent — re-running does not duplicate clients or clobber the default", async () => {
    const { env } = await getTestServer();

    const first = await provisionDefaultClients(env.data, "tenantId", {
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });
    const { clients: afterFirst } = await env.data.clients.list("tenantId");

    const second = await provisionDefaultClients(env.data, "tenantId", {
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });
    const { clients: afterSecond } = await env.data.clients.list("tenantId");

    expect(second.defaultClientId).toBe(first.defaultClientId);
    expect(second.managementClientId).toBe(first.managementClientId);
    expect(afterSecond.length).toBe(afterFirst.length);
  });

  it("restores a missing Management API grant for an existing M2M client (partial-failure recovery)", async () => {
    const { env } = await getTestServer();

    // Simulate a prior run that created the M2M client but failed before its
    // Management API grant was written.
    await env.data.clients.create("tenantId", {
      client_id: "orphanM2m",
      client_secret: "s",
      name: "API Explorer Application",
      app_type: "non_interactive",
      grant_types: ["client_credentials"],
    });

    const result = await provisionDefaultClients(env.data, "tenantId", {
      managementApiIdentifier: MANAGEMENT_AUDIENCE,
      managementApiScopes: MANAGEMENT_API_SCOPES,
    });

    // Reuses the orphaned client rather than creating a duplicate...
    expect(result.managementClientId).toBe("orphanM2m");
    // ...and restores the missing grant.
    const { client_grants } = await env.data.clientGrants.list("tenantId", {});
    const grant = client_grants.find((g) => g.client_id === "orphanM2m");
    expect(grant?.audience).toBe(MANAGEMENT_AUDIENCE);
  });

  it("respects an already-configured, valid default_client_id", async () => {
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

    const result = await provisionDefaultClients(env.data, "tenantId", {
      createManagementClient: false,
    });

    expect(result.defaultClientId).toBe("preferred");
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
