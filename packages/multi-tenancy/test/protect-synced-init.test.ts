import { describe, it, expect, beforeEach } from "vitest";
import createAdapters from "@authhero/kysely-adapter";
import { encodeBase64Url } from "@authhero/adapter-interfaces";
import { init } from "authhero";
import { initMultiTenant } from "../src/init";
import { createMigratedDb } from "./helpers/migrated-db";

const CONTROL_PLANE = "control_plane";
const CHILD = "acme";
const ISSUER = "https://auth.example.com/";
const MANAGEMENT_AUDIENCE = "urn:authhero:management";

function pemToDer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

async function signRs256(
  pkcs8Pem: string,
  kid: string,
  claims: Record<string, unknown>,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pkcs8Pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encode = (value: unknown) =>
    encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const signingInput = `${encode({ alg: "RS256", typ: "JWT", kid })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

/**
 * initMultiTenant must stop child-tenant management writes to entities synced
 * from the control plane (`is_system: true`). The guard is
 * createProtectSyncedMiddleware; it has to actually run in front of the
 * management API routes.
 */
describe("initMultiTenant protects synced entities", () => {
  let request: (
    method: string,
    path: string,
    body?: unknown,
  ) => Promise<Response>;
  let ids: {
    systemRole: string;
    customRole: string;
    systemConnection: string;
    customConnection: string;
  };

  beforeEach(async () => {
    const adapters = createAdapters(await createMigratedDb());
    for (const id of [CONTROL_PLANE, CHILD]) {
      await adapters.tenants.create({
        id,
        friendly_name: id,
        audience: `https://${id}.example.com`,
        sender_email: "admin@example.com",
        sender_name: id,
      });
    }

    // Control-plane signing key, used to mint the admin token below.
    const { createX509Certificate } = init({ dataAdapter: adapters });
    const signingKey = await createX509Certificate({ name: "CN=test" });
    await adapters.keys.create({ ...signingKey, type: "jwt_signing" });

    const systemRole = await adapters.roles.create(CHILD, {
      name: "synced-role",
      is_system: true,
    });
    const customRole = await adapters.roles.create(CHILD, {
      name: "custom-role",
    });
    const systemConnection = await adapters.connections.create(CHILD, {
      name: "synced-connection",
      strategy: "Username-Password-Authentication",
      is_system: true,
    });
    const customConnection = await adapters.connections.create(CHILD, {
      name: "custom-connection",
      strategy: "Username-Password-Authentication",
    });
    ids = {
      systemRole: systemRole.id,
      customRole: customRole.id,
      systemConnection: systemConnection.id,
      customConnection: customConnection.id,
    };

    const { app } = initMultiTenant({
      dataAdapter: adapters,
      controlPlane: {
        tenantId: CONTROL_PLANE,
        clientId: "control-plane-client",
      },
    });

    const now = Math.floor(Date.now() / 1000);
    const token = await signRs256(signingKey.pkcs7!, signingKey.kid, {
      iss: ISSUER,
      aud: MANAGEMENT_AUDIENCE,
      sub: "admin",
      tenant_id: CONTROL_PLANE,
      permissions: [
        "update:roles",
        "delete:roles",
        "update:connections",
        "delete:connections",
      ],
      iat: now,
      exp: now + 3600,
    });

    // No `data` here: initMultiTenant's wrapped adapter (which carries the
    // control-plane config) must be the one in use, as in a deployment.
    const env = {
      ISSUER,
      AUTH_URL: "https://auth.example.com",
      ENVIRONMENT: "test",
    };

    request = (method, path, body) =>
      app.request(
        path,
        {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": CHILD,
            "content-type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
        env,
      );
  });

  it("refuses to update or delete a synced role", async () => {
    const patch = await request("PATCH", `/api/v2/roles/${ids.systemRole}`, {
      description: "changed",
    });
    expect(patch.status).toBe(403);
    expect(await patch.text()).toMatch(/system resource/);

    const del = await request("DELETE", `/api/v2/roles/${ids.systemRole}`);
    expect(del.status).toBe(403);
  });

  it("refuses to update or delete a synced connection", async () => {
    const patch = await request(
      "PATCH",
      `/api/v2/connections/${ids.systemConnection}`,
      { display_name: "changed" },
    );
    expect(patch.status).toBe(403);
    expect(await patch.text()).toMatch(/system resource/);

    const del = await request(
      "DELETE",
      `/api/v2/connections/${ids.systemConnection}`,
    );
    expect(del.status).toBe(403);
  });

  it("still allows writes to the tenant's own entities", async () => {
    const role = await request("PATCH", `/api/v2/roles/${ids.customRole}`, {
      description: "changed",
    });
    expect(role.status).toBe(200);

    const connection = await request(
      "PATCH",
      `/api/v2/connections/${ids.customConnection}`,
      { display_name: "changed" },
    );
    expect(connection.status).toBe(200);
  });
});
