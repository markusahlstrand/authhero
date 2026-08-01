import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { createX509Certificate } from "../../../src/utils/encryption";

describe("keys", () => {
  it("should rotate a key", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const rotateResponse = await managementClient.keys.signing.rotate.$post(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(rotateResponse.status).toBe(201);

    // Get a list of the keys. There should be 2 keys, one revoked and one active
    const keysResponse = await managementClient.keys.signing.$get(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(keysResponse.status).toBe(200);
    const keys = await keysResponse.json();
    expect(keys).toHaveLength(2);
  });

  it("rotate does not revoke public-only control-plane keys", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    // Simulate a WFP tenant's projected control-plane verify key: a
    // control-plane-scoped key (no tenant_id) with private material stripped
    // (no pkcs7), exactly what `toPublicControlPlaneKey` writes.
    const generated = await createX509Certificate({ name: "CN=control-plane" });
    const projectedKid = generated.kid;
    await env.data.keys.create({
      kid: projectedKid,
      cert: generated.cert,
      fingerprint: generated.fingerprint,
      thumbprint: generated.thumbprint,
      type: "jwt_signing",
      created_at: new Date().toISOString(),
    });

    // The signable key the seed created for this tenant (has pkcs7).
    const before = await env.data.keys.list({ q: "type:jwt_signing" });
    const signableBefore = before.signingKeys.find((k) => k.pkcs7 && k.cert);
    expect(signableBefore).toBeDefined();

    const token = await getAdminToken();
    const rotateResponse = await managementClient.keys.signing.rotate.$post(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(rotateResponse.status).toBe(201);

    const after = await env.data.keys.list({ q: "type:jwt_signing" });

    // The projected public key must be left untouched — the control plane is
    // still signing with it, and the tenant doesn't own it.
    const projectedAfter = after.signingKeys.find(
      (k) => k.kid === projectedKid,
    );
    expect(projectedAfter?.revoked_at).toBeFalsy();

    // The tenant's own signable key is rotated out (revoked).
    const signableAfter = after.signingKeys.find(
      (k) => k.kid === signableBefore!.kid,
    );
    expect(signableAfter?.revoked_at).toBeTruthy();
  });

  it("should reovke a key", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Get a list of the keys.
    const keysResponse = await managementClient.keys.signing.$get(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(keysResponse.status).toBe(200);
    const keys = await keysResponse.json();
    expect(keys).toHaveLength(1);

    const kid = keys[0]!.kid;
    expect(kid).toBeTypeOf("string");

    const rovokeResponse = await managementClient.keys.signing[kid].revoke.$put(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(rovokeResponse.status).toBe(200);

    // Immediate revoke invalidates tokens signed by the just-revoked kid, so
    // the bearer above can no longer call the management API. Verify the
    // resulting state directly: one active key (new), one revoked (old).
    const { signingKeys } = await env.data.keys.list({
      q: "type:jwt_signing",
    });
    const now = Date.now();
    const active = signingKeys.filter(
      (k) => !k.revoked_at || new Date(k.revoked_at).getTime() > now,
    );
    expect(active).toHaveLength(1);
    expect(active[0]?.kid).not.toBe(kid);
  });

  it("should get a key by kid", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Get a list of the keys.
    const keysResponse = await managementClient.keys.signing.$get(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );
    expect(keysResponse.status).toBe(200);
    const keys = await keysResponse.json();
    expect(keys).toHaveLength(1);

    const kid = keys[0]!.kid;
    expect(kid).toBeTypeOf("string");

    // Get a key by kid.
    const keyResponse = await managementClient.keys.signing[kid].$get(
      {
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(keyResponse.status).toBe(200);
    const key = await keyResponse.json();
    expect(key.kid).toBe(kid);
  });
});
