import { describe, it, expect } from "vitest";
import { getTestServer } from "../../helpers/test-server";
import { hashRegistrationToken } from "../../../src/helpers/dcr/mint-token";
import type { Bindings } from "../../../src/types";

/**
 * End-to-end coverage for /u2/connect/start (and the new /u2/connect/select-tenant
 * step that runs only on a multi-tenancy control plane). The corresponding GET
 * /connect/start endpoint is exercised in connect-start.spec.ts.
 */

const VALID_QS = new URLSearchParams({
  integration_type: "wordpress",
  domain: "publisher.com",
  return_to: "https://publisher.com/wp-admin/connect-callback",
  state: "csrf-abc",
}).toString();

async function enableConnectFlow(env: Bindings) {
  await env.data.tenants.update("tenantId", {
    flags: {
      enable_dynamic_client_registration: true,
      dcr_require_initial_access_token: true,
    },
  });
}

async function startConnectFlow(
  oauthApp: any,
  env: Bindings,
  tenantId = "tenantId",
): Promise<string> {
  const response = await oauthApp.request(
    `/connect/start?${VALID_QS}`,
    { method: "GET", headers: { "tenant-id": tenantId } },
    env,
  );
  expect(response.status).toBe(302);
  const location = response.headers.get("location")!;
  const stateId = new URL(location, "http://localhost").searchParams.get(
    "state",
  )!;
  expect(stateId).toBeTruthy();
  return stateId;
}

async function createUserSession(env: Bindings, tenantId = "tenantId") {
  const session = await env.data.sessions.create(tenantId, {
    id: `session_${tenantId}`,
    login_session_id: "ignored",
    user_id: "email|userId",
    clients: ["clientId"],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: new Date().toISOString(),
    device: {
      last_ip: "",
      initial_ip: "",
      last_user_agent: "",
      initial_user_agent: "",
      initial_asn: "",
      last_asn: "",
    },
  });
  return session;
}

async function provisionControlPlane(env: Bindings) {
  // Mark the existing tenant as the control plane and create a child tenant.
  // The org name on the control plane intentionally matches the child tenant
  // id, mirroring the convention enforced by @authhero/multi-tenancy's
  // provisioning hooks.
  (env.data as any).multiTenancyConfig = {
    controlPlaneTenantId: "tenantId",
  };

  await env.data.tenants.create({
    id: "child_tenant",
    friendly_name: "Publisher Workspace",
    audience: "urn:authhero:tenant:child_tenant",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  // The child tenant needs at least one client because connect-start uses
  // the first client as the login_session anchor — but the picker flow
  // anchors on the control plane's client, so this is purely defensive.
  await env.data.clients.create("child_tenant", {
    client_id: "child_client",
    client_secret: "secret",
    name: "Child Client",
  });

  const org = await env.data.organizations.create("tenantId", {
    name: "child_tenant",
    display_name: "Publisher Workspace",
  });
  await env.data.userOrganizations.create("tenantId", {
    user_id: "email|userId",
    organization_id: org.id,
  });
  return org;
}

describe("/u2/connect/start — direct-to-child mode (no multi-tenancy)", () => {
  it("renders the consent screen directly when the request resolves to a leaf tenant", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    const stateId = await startConnectFlow(oauthApp, env);

    const session = await createUserSession(env);

    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );
    // 200 = consent screen rendered. A 302 here would mean we wrongly
    // bounced through the picker.
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("publisher.com");
  });

  it("POST consent mints the IAT on the request tenant and omits authhero_tenant", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    const stateId = await startConnectFlow(oauthApp, env);
    const session = await createUserSession(env);

    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      },
      env,
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location")!;
    const url = new URL(location);
    const iat = url.searchParams.get("authhero_iat");
    expect(iat).toBeTruthy();
    expect(url.searchParams.get("authhero_tenant")).toBeNull();
    expect(url.searchParams.get("state")).toBe("csrf-abc");

    // The IAT is stored on the request tenant.
    const hash = await hashRegistrationToken(iat!);
    const stored = await env.data.clientRegistrationTokens!.getByHash(
      "tenantId",
      hash,
    );
    expect(stored).toBeTruthy();
    expect(stored!.sub).toBe("email|userId");
  });
});

describe("/u2/connect/start — control-plane mode (multi-tenancy)", () => {
  it("redirects to the workspace picker when no target tenant has been chosen", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    await provisionControlPlane(env);
    const stateId = await startConnectFlow(oauthApp, env);
    const session = await createUserSession(env);

    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}`,
      {
        method: "GET",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
        },
      },
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/u2/connect/select-tenant?state=${encodeURIComponent(stateId)}`,
    );
  });

  it("workspace picker POST persists target_tenant_id and redirects back to consent", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    await provisionControlPlane(env);
    const stateId = await startConnectFlow(oauthApp, env);
    const session = await createUserSession(env);

    const response = await u2App.request(
      `/connect/select-tenant?state=${encodeURIComponent(stateId)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "tenant_child_tenant=Publisher+Workspace",
      },
      env,
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `/u2/connect/start?state=${encodeURIComponent(stateId)}`,
    );

    const updated = await env.data.loginSessions.get("tenantId", stateId);
    const stateData = JSON.parse(updated!.state_data!);
    expect(stateData.connect.target_tenant_id).toBe("child_tenant");
    // Original connect data is preserved.
    expect(stateData.connect.domain).toBe("publisher.com");
    expect(stateData.connect.caller_state).toBe("csrf-abc");
  });

  it("workspace picker rejects a tenant the user has no membership in", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    await provisionControlPlane(env);
    // Add a second tenant that the user does NOT belong to.
    await env.data.tenants.create({
      id: "other_tenant",
      friendly_name: "Other",
      audience: "urn:authhero:tenant:other_tenant",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });
    const stateId = await startConnectFlow(oauthApp, env);
    const session = await createUserSession(env);

    const response = await u2App.request(
      `/connect/select-tenant?state=${encodeURIComponent(stateId)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "tenant_other_tenant=Other",
      },
      env,
    );
    // Re-renders the picker with an error. Importantly: state_data is unchanged.
    expect(response.status).toBe(200);
    const updated = await env.data.loginSessions.get("tenantId", stateId);
    const stateData = JSON.parse(updated!.state_data!);
    expect(stateData.connect.target_tenant_id).toBeUndefined();
  });

  it("consent POST mints the IAT on the chosen child tenant and adds authhero_tenant to the redirect", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    await provisionControlPlane(env);
    const stateId = await startConnectFlow(oauthApp, env);
    const session = await createUserSession(env);

    // Skip the picker UI and write target_tenant_id directly — this asserts
    // the consent step alone behaves correctly.
    const ls = await env.data.loginSessions.get("tenantId", stateId);
    const data = JSON.parse(ls!.state_data!);
    data.connect.target_tenant_id = "child_tenant";
    await env.data.loginSessions.update("tenantId", stateId, {
      state_data: JSON.stringify(data),
    });

    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      },
      env,
    );
    expect(response.status).toBe(302);
    const url = new URL(response.headers.get("location")!);
    expect(url.searchParams.get("authhero_tenant")).toBe("child_tenant");
    const iat = url.searchParams.get("authhero_iat");
    expect(iat).toBeTruthy();

    // IAT is stored on the child tenant, not the control plane.
    const hash = await hashRegistrationToken(iat!);
    const onChild = await env.data.clientRegistrationTokens!.getByHash(
      "child_tenant",
      hash,
    );
    expect(onChild).toBeTruthy();
    const onCp = await env.data.clientRegistrationTokens!.getByHash(
      "tenantId",
      hash,
    );
    expect(onCp).toBeNull();
  });

  it("consent POST refuses to mint when target_tenant_id is set but the user lost membership", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    const org = await provisionControlPlane(env);
    const stateId = await startConnectFlow(oauthApp, env);
    const session = await createUserSession(env);

    const ls = await env.data.loginSessions.get("tenantId", stateId);
    const data = JSON.parse(ls!.state_data!);
    data.connect.target_tenant_id = "child_tenant";
    await env.data.loginSessions.update("tenantId", stateId, {
      state_data: JSON.stringify(data),
    });

    // Simulate the user being removed from the org between picker and consent.
    const memberships = await env.data.userOrganizations.list("tenantId", {
      q: `user_id:email|userId`,
    });
    const membership = memberships.userOrganizations.find(
      (m) => m.organization_id === org.id,
    );
    if (membership) {
      await env.data.userOrganizations.remove("tenantId", membership.id);
    }

    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}`,
      {
        method: "POST",
        headers: {
          "tenant-id": "tenantId",
          cookie: `tenantId-auth-token=${session.id}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      },
      env,
    );
    // Re-renders consent with an error — no redirect, no IAT issued.
    expect(response.status).toBe(200);
    // Nothing was minted on either tenant.
    // (We don't have the IAT to look up here — the assertion above that we
    // did not redirect is the sufficient signal that no token was returned.)
  });

  it("falls back to direct-tenant minting when the request hits a leaf tenant even if multiTenancyConfig is set", async () => {
    const { oauthApp, u2App, env } = await getTestServer();
    await enableConnectFlow(env);
    await provisionControlPlane(env);
    // Enable DCR on the child tenant so /connect/start succeeds against it.
    await env.data.tenants.update("child_tenant", {
      flags: {
        enable_dynamic_client_registration: true,
        dcr_require_initial_access_token: true,
      },
    });

    const stateId = await startConnectFlow(oauthApp, env, "child_tenant");
    // The child tenant has no signed-in user in this test — the consent
    // screen should bounce to login, NOT to the picker.
    const response = await u2App.request(
      `/connect/start?state=${encodeURIComponent(stateId)}`,
      {
        method: "GET",
        headers: { "tenant-id": "child_tenant" },
      },
      env,
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("location")!;
    expect(location).not.toContain("/connect/select-tenant");
    expect(location).toContain("/login");
  });
});
