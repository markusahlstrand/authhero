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

describe("saml_encryption keys", () => {
  async function seedSamlKey(
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
  ) {
    const generated = await createX509Certificate({
      name: "CN=saml",
      validityDays: 1,
    });
    // SAML certificates are per-tenant: each is published in that tenant's IdP
    // metadata and pinned by that tenant's service providers.
    await env.data.keys.create({
      ...generated,
      type: "saml_encryption",
      tenant_id: "tenantId",
    });
    return generated;
  }

  it("rotates the SAML bucket without touching the JWT keys", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await seedSamlKey(env);
    const jwtBefore = await env.data.keys.list({ q: "type:jwt_signing" });

    const rotateResponse = await managementClient.keys.signing.rotate.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(rotateResponse.status).toBe(201);

    // The JWT key the tenant signs tokens with must be left alone — rotating
    // SAML certificates has nothing to do with it.
    const jwtAfter = await env.data.keys.list({ q: "type:jwt_signing" });
    expect(jwtAfter.signingKeys.map((k) => k.revoked_at)).toEqual(
      jwtBefore.signingKeys.map((k) => k.revoked_at),
    );

    const samlKeys = await env.data.keys.list({ q: "type:saml_encryption" });
    expect(samlKeys.signingKeys).toHaveLength(2);
  });

  it("defaults SAML certificates to a five-year lifetime", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await seedSamlKey(env);
    const response = await managementClient.keys.signing.rotate.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    const created = await response.json();
    const lifetimeDays =
      (new Date(created.expires_at!).getTime() - Date.now()) /
      (24 * 60 * 60 * 1000);
    expect(Math.round(lifetimeDays)).toBe(5 * 365);
  });

  it("stages a rotation so the new key publishes before it signs", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const seeded = await seedSamlKey(env);
    await managementClient.keys.signing.rotate.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: {
          type: "saml_encryption",
          activate_in_days: "7",
          grace_days: "7",
        },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );

    const listResponse = await managementClient.keys.signing.$get(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const keys = await listResponse.json();
    expect(keys).toHaveLength(2);

    // The incoming key is published but staged; the outgoing key keeps signing.
    const incoming = keys.find((k) => k.kid !== seeded.kid);
    const outgoing = keys.find((k) => k.kid === seeded.kid);
    expect(incoming?.next).toBe(true);
    expect(incoming?.current).toBe(false);
    expect(outgoing?.current).toBe(true);

    // The outgoing key must outlive the incoming key's activation, otherwise
    // it would be revoked while it is still the one signing.
    const revokedAt = new Date(outgoing!.revoked_at!).getTime();
    expect(revokedAt).toBeGreaterThan(
      new Date(incoming!.current_since!).getTime(),
    );
  });

  it("renews a certificate in place, keeping the kid and public key", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const seeded = await seedSamlKey(env);

    const response = await managementClient.keys.signing[
      seeded.kid
    ].renew.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption", validity_days: "1825" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(200);
    const renewed = await response.json();

    // Same key, new certificate: a service provider validating against the
    // public key it already holds needs no update at all.
    expect(renewed.kid).toBe(seeded.kid);
    expect(renewed.fingerprint).toBe(seeded.fingerprint);
    expect(renewed.cert).not.toBe(seeded.cert);
    expect(renewed.expired).toBe(false);

    const stored = await env.data.keys.list({ q: "type:saml_encryption" });
    expect(stored.signingKeys).toHaveLength(1);
    expect(stored.signingKeys[0]!.cert).toBe(renewed.cert);
    // The private key is untouched — that is the whole point of a renewal.
    expect(stored.signingKeys[0]!.pkcs7).toBe(seeded.pkcs7);
  });

  it("refuses to renew an inherited key with no private material", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const generated = await createX509Certificate({ name: "CN=public-only" });
    await env.data.keys.create({
      kid: generated.kid,
      cert: generated.cert,
      fingerprint: generated.fingerprint,
      thumbprint: generated.thumbprint,
      type: "saml_encryption",
    });

    const response = await managementClient.keys.signing[
      generated.kid
    ].renew.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(403);
  });

  it("never returns private key material", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.keys.signing.$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const keys = await response.json();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toHaveProperty("pkcs7");
      expect(key.expires_at).toBeTypeOf("string");
    }
  });
});

describe("inherited keys", () => {
  // With signingKeyMode "tenant" the tenant owns its own rows and the shared
  // control-plane rows are only a fallback — a vendor must not be able to
  // touch them, and the console must be able to tell them apart.
  async function tenantModeServer() {
    const server = await getTestServer();
    return {
      ...server,
      env: { ...server.env, signingKeyMode: "tenant" as const },
    };
  }

  it("flags shared control-plane keys as inherited for a tenant", async () => {
    const { managementApp, env } = await tenantModeServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // The seeded key has no tenant_id: it is the shared control-plane key.
    const response = await managementClient.keys.signing.$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const keys = await response.json();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.tenant_id).toBeFalsy();
      expect(key.inherited).toBe(true);
    }
  });

  it("refuses to revoke a key inherited from the control plane", async () => {
    const { managementApp, env } = await tenantModeServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const { signingKeys } = await env.data.keys.list({ q: "type:jwt_signing" });
    const shared = signingKeys.find((k) => !k.tenant_id && k.pkcs7);
    expect(shared).toBeDefined();

    const response = await managementClient.keys.signing[
      shared!.kid
    ].revoke.$put(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(403);

    // Still live: the control plane is signing with it.
    const after = await env.data.keys.list({ q: "type:jwt_signing" });
    expect(
      after.signingKeys.find((k) => k.kid === shared!.kid)?.revoked_at,
    ).toBeFalsy();
  });

  it("refuses to renew a key inherited from the control plane", async () => {
    const { managementApp, env } = await tenantModeServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const { signingKeys } = await env.data.keys.list({ q: "type:jwt_signing" });
    const shared = signingKeys.find((k) => !k.tenant_id && k.pkcs7);

    const response = await managementClient.keys.signing[
      shared!.kid
    ].renew.$post(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(403);

    const after = await env.data.keys.list({ q: "type:jwt_signing" });
    expect(after.signingKeys.find((k) => k.kid === shared!.kid)?.cert).toBe(
      shared!.cert,
    );
  });

  it("lets a tenant rotate and then modify its own key", async () => {
    const { managementApp, env } = await tenantModeServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Rotating in tenant mode mints a tenant-owned key...
    const rotated = await managementClient.keys.signing.rotate.$post(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(rotated.status).toBe(201);
    const owned = await rotated.json();
    expect(owned.tenant_id).toBe("tenantId");
    expect(owned.inherited).toBe(false);

    // ...which the tenant is then free to renew.
    const renewed = await managementClient.keys.signing[owned.kid].renew.$post(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(renewed.status).toBe(200);
  });
});

describe("a vendor tenant on a shared control plane", () => {
  // The shape that matters in production: one control plane ("main") whose
  // keys every other tenant falls back to. A vendor must be able to see and
  // verify with those certificates, and must not be able to touch them.
  async function sharedControlPlaneServer() {
    // Inject at construction: the management app re-derives `ctx.env.data`
    // from the adapter it was built with, so overriding env per request has
    // no effect.
    return getTestServer({
      wrapDataAdapter: (data) => ({
        ...data,
        multiTenancyConfig: { controlPlaneTenantId: "main" },
      }),
    });
  }

  it("inherits the control plane's certificates read-only", async () => {
    const { managementApp, env } = await sharedControlPlaneServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.keys.signing.$get(
      { header: { "tenant-id": "tenantId" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const keys = await response.json();

    // Visible — the vendor needs the certificate to verify.
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.inherited)).toBe(true);
    expect(keys.every((k) => typeof k.cert === "string")).toBe(true);
  });

  it("cannot rotate, renew or revoke them", async () => {
    const { managementApp, env } = await sharedControlPlaneServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    const header = { "tenant-id": "tenantId" };
    const auth = { headers: { authorization: `Bearer ${token}` } };

    const { signingKeys } = await env.data.keys.list({ q: "type:jwt_signing" });
    const shared = signingKeys.find((k) => !k.tenant_id && k.pkcs7)!;

    const rotate = await managementClient.keys.signing.rotate.$post(
      { header },
      auth,
    );
    expect(rotate.status).toBe(403);

    const renew = await managementClient.keys.signing[shared.kid].renew.$post(
      { header },
      auth,
    );
    expect(renew.status).toBe(403);

    const revoke = await managementClient.keys.signing[shared.kid].revoke.$put(
      { header },
      auth,
    );
    expect(revoke.status).toBe(403);

    // Untouched: same certificate, still live.
    const after = await env.data.keys.list({ q: "type:jwt_signing" });
    expect(after.signingKeys).toHaveLength(signingKeys.length);
    const still = after.signingKeys.find((k) => k.kid === shared.kid);
    expect(still?.cert).toBe(shared.cert);
    expect(still?.revoked_at).toBeFalsy();
  });

  it("still lets the control plane tenant rotate them", async () => {
    const { managementApp, env } = await sharedControlPlaneServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    const response = await managementClient.keys.signing.rotate.$post(
      { header: { "tenant-id": "main" } },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.inherited).toBe(false);
  });
});

describe("a legacy unscoped SAML certificate", () => {
  // What every existing deployment looks like before the per-tenant model:
  // one `saml_encryption` row with no tenant_id, shared by whoever finds it.
  async function seedSharedSamlKey(
    env: Awaited<ReturnType<typeof getTestServer>>["env"],
  ) {
    const generated = await createX509Certificate({ name: "CN=legacy-saml" });
    await env.data.keys.create({ ...generated, type: "saml_encryption" });
    return generated;
  }

  it("is still resolved for signing, but is read-only for the tenant", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    const legacy = await seedSharedSamlKey(env);

    const listed = await managementClient.keys.signing.$get(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    const keys = await listed.json();
    const row = keys.find((k) => k.kid === legacy.kid);

    // Visible and signing — nothing breaks for a deployment that never
    // stamped a tenant_id...
    expect(row?.current).toBe(true);
    // ...but it belongs to the control plane, so the tenant can't touch it.
    expect(row?.inherited).toBe(true);

    const renew = await managementClient.keys.signing[legacy.kid].renew.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(renew.status).toBe(403);
  });

  it("is superseded once the tenant gets its own certificate", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    const legacy = await seedSharedSamlKey(env);

    // Rotating in the SAML tab mints a tenant-owned certificate...
    const rotated = await managementClient.keys.signing.rotate.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(rotated.status).toBe(201);
    const own = await rotated.json();
    expect(own.tenant_id).toBe("tenantId");
    expect(own.inherited).toBe(false);

    // ...which the tenant owns and can renew, while the shared row is left
    // untouched for whoever else still falls back to it.
    const renewed = await managementClient.keys.signing[own.kid].renew.$post(
      {
        header: { "tenant-id": "tenantId" },
        query: { type: "saml_encryption" },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
    expect(renewed.status).toBe(200);

    const stored = await env.data.keys.list({ q: "type:saml_encryption" });
    const legacyRow = stored.signingKeys.find((k) => k.kid === legacy.kid);
    expect(legacyRow?.revoked_at).toBeFalsy();
  });
});
