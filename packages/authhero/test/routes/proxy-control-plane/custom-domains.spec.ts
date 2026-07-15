import { describe, it, expect, vi } from "vitest";
import type {
  CustomDomain,
  CustomDomainsAdapter,
  CustomDomainWithTenantId,
} from "@authhero/adapter-interfaces";
import { createProxyControlPlaneApp } from "../../../src/routes/proxy-control-plane";
import {
  CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE,
  PROXY_RESOLVE_HOST_SCOPE,
} from "../../../src/routes/proxy-control-plane/scopes";
import { createTestKeyset, type TestKeyset } from "./jwt-fixture";

const ISSUER = "https://controlplane.example.test/";

/**
 * A shard's service token. `tenant_id` is what the resource authorizes on —
 * the scope alone is held by every shard, so it says who you are, not what you
 * may touch.
 */
async function bearer(
  keyset: TestKeyset,
  // `tenantId: null` mints a token with no tenant claim at all (a default of
  // `undefined` would be indistinguishable from "not passed").
  {
    scope = CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE,
    tenantId = "t1" as string | null,
  } = {},
): Promise<string> {
  const token = await keyset.sign({
    payload: {
      iss: ISSUER,
      sub: "tenant-shard",
      scope,
      ...(tenantId === null ? {} : { tenant_id: tenantId }),
    },
  });
  return `Bearer ${token}`;
}

function envWithIssuer(): { ISSUER: string } {
  return { ISSUER };
}

function domain(overrides: Partial<CustomDomain> = {}): CustomDomain {
  return {
    custom_domain_id: "cd-1",
    domain: "login.acme.com",
    type: "auth0_managed_certs",
    primary: false,
    status: "pending",
    ...overrides,
  };
}

/**
 * Stands in for the Cloudflare adapter wrapping the control-plane database:
 * `create` is what registers the hostname in the CF-for-SaaS zone, so asserting
 * on it is asserting that registration actually happened.
 */
function makeAuthoritativeAdapter(
  seed: Array<{ tenant_id: string; domain: CustomDomain }> = [],
): CustomDomainsAdapter & { rows: Map<string, CustomDomainWithTenantId> } {
  const rows = new Map<string, CustomDomainWithTenantId>();
  for (const row of seed) {
    rows.set(`${row.tenant_id}:${row.domain.custom_domain_id}`, {
      ...row.domain,
      tenant_id: row.tenant_id,
    });
  }

  return {
    rows,
    create: vi.fn(async (tenant_id, input) => {
      const created = domain({
        ...input,
        custom_domain_id: input.custom_domain_id ?? "cd-new",
        status: "pending",
      });
      rows.set(`${tenant_id}:${created.custom_domain_id}`, {
        ...created,
        tenant_id,
      });
      return created;
    }),
    get: vi.fn(async (tenant_id, id) => {
      const row = rows.get(`${tenant_id}:${id}`);
      if (!row) return null;
      const { tenant_id: _t, ...rest } = row;
      return rest;
    }),
    getByDomain: vi.fn(
      async (host) =>
        [...rows.values()].find((row) => row.domain === host) ?? null,
    ),
    list: vi.fn(async (tenant_id) =>
      [...rows.values()]
        .filter((row) => row.tenant_id === tenant_id)
        .map(({ tenant_id: _t, ...rest }) => rest),
    ),
    update: vi.fn(async (tenant_id, id, patch) => {
      const key = `${tenant_id}:${id}`;
      const existing = rows.get(key);
      if (!existing) return false;
      rows.set(key, { ...existing, ...patch });
      return true;
    }),
    remove: vi.fn(async (tenant_id, id) => rows.delete(`${tenant_id}:${id}`)),
  };
}

async function setup(customDomains: CustomDomainsAdapter) {
  const keyset = await createTestKeyset({
    jwksUrl: `${ISSUER}.well-known/jwks.json`,
  });
  const app = createProxyControlPlaneApp({
    resolveHost: async () => null,
    jwksFetch: keyset.jwksFetch,
    customDomains,
  });
  return { app, keyset };
}

describe("control-plane /custom-domains", () => {
  it("is not mounted when no customDomains adapter is configured", async () => {
    const keyset = await createTestKeyset({
      jwksUrl: `${ISSUER}.well-known/jwks.json`,
    });
    const app = createProxyControlPlaneApp({
      resolveHost: async () => null,
      jwksFetch: keyset.jwksFetch,
    });
    const res = await app.request(
      "/custom-domains?tenant_id=t1",
      { headers: { authorization: await bearer(keyset) } },
      envWithIssuer(),
    );
    expect(res.status).toBe(404);
  });

  it("registers the hostname and returns 201 on create", async () => {
    const adapter = makeAuthoritativeAdapter();
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: await bearer(keyset),
        },
        body: JSON.stringify({
          tenant_id: "t1",
          domain: "login.acme.com",
          type: "auth0_managed_certs",
        }),
      },
      envWithIssuer(),
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      domain: "login.acme.com",
      status: "pending",
    });
    // The Cloudflare-backed create ran — this is the registration the tenant
    // shard could never perform itself.
    expect(adapter.create).toHaveBeenCalledWith("t1", {
      domain: "login.acme.com",
      type: "auth0_managed_certs",
    });
  });

  it("returns 409 and registers nothing when another tenant owns the domain", async () => {
    const adapter = makeAuthoritativeAdapter([
      { tenant_id: "t-other", domain: domain({ domain: "login.acme.com" }) },
    ]);
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: await bearer(keyset),
        },
        body: JSON.stringify({
          tenant_id: "t1",
          domain: "login.acme.com",
          type: "auth0_managed_certs",
        }),
      },
      envWithIssuer(),
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "conflict" });
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("is idempotent when the same tenant re-creates a domain it already owns", async () => {
    const adapter = makeAuthoritativeAdapter([
      { tenant_id: "t1", domain: domain({ domain: "login.acme.com" }) },
    ]);
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: await bearer(keyset),
        },
        body: JSON.stringify({
          tenant_id: "t1",
          domain: "login.acme.com",
          type: "auth0_managed_certs",
        }),
      },
      envWithIssuer(),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ custom_domain_id: "cd-1" });
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("canonicalizes the hostname so a differently-cased create matches the owned record", async () => {
    // The row is stored lower-cased (as the resolution path looks it up); a
    // create for `Login.acme.com` must resolve to it, not register a duplicate.
    const adapter = makeAuthoritativeAdapter([
      { tenant_id: "t1", domain: domain({ domain: "login.acme.com" }) },
    ]);
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: await bearer(keyset),
        },
        body: JSON.stringify({
          tenant_id: "t1",
          domain: "Login.Acme.com",
          type: "auth0_managed_certs",
        }),
      },
      envWithIssuer(),
    );

    expect(res.status).toBe(200);
    expect(adapter.getByDomain).toHaveBeenCalledWith("login.acme.com");
    expect(adapter.create).not.toHaveBeenCalled();
  });

  it("registers a new hostname lower-cased", async () => {
    const adapter = makeAuthoritativeAdapter();
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: await bearer(keyset),
        },
        body: JSON.stringify({
          tenant_id: "t1",
          domain: "Login.Acme.com",
          type: "auth0_managed_certs",
        }),
      },
      envWithIssuer(),
    );

    expect(res.status).toBe(201);
    expect(adapter.create).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ domain: "login.acme.com" }),
    );
  });

  it("maps a Cloudflare duplicate-hostname error to 409", async () => {
    // DB and zone have drifted: nothing in the control-plane DB, but the zone
    // already holds the hostname. One coherent answer, not a 500.
    const adapter = makeAuthoritativeAdapter();
    adapter.create = vi.fn(async () => {
      throw new Error(
        '[{"code":1406,"message":"Duplicate custom hostname found."}]',
      );
    });
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: await bearer(keyset),
        },
        body: JSON.stringify({
          tenant_id: "t1",
          domain: "login.acme.com",
          type: "auth0_managed_certs",
        }),
      },
      envWithIssuer(),
    );

    expect(res.status).toBe(409);
  });

  it("gets, lists and removes a tenant's domains", async () => {
    const adapter = makeAuthoritativeAdapter([
      { tenant_id: "t1", domain: domain() },
    ]);
    const { app, keyset } = await setup(adapter);
    const auth = await bearer(keyset);

    const get = await app.request(
      "/custom-domains/cd-1?tenant_id=t1",
      { headers: { authorization: auth } },
      envWithIssuer(),
    );
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ custom_domain_id: "cd-1" });

    const list = await app.request(
      "/custom-domains?tenant_id=t1",
      { headers: { authorization: auth } },
      envWithIssuer(),
    );
    expect(await list.json()).toHaveLength(1);

    const removed = await app.request(
      "/custom-domains/cd-1?tenant_id=t1",
      { method: "DELETE", headers: { authorization: auth } },
      envWithIssuer(),
    );
    expect(removed.status).toBe(204);
    expect(adapter.remove).toHaveBeenCalledWith("t1", "cd-1");

    const gone = await app.request(
      "/custom-domains/cd-1?tenant_id=t1",
      { headers: { authorization: auth } },
      envWithIssuer(),
    );
    expect(gone.status).toBe(404);
  });

  it("returns 404 when getting another tenant's domain", async () => {
    const adapter = makeAuthoritativeAdapter([
      { tenant_id: "t-other", domain: domain() },
    ]);
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains/cd-1?tenant_id=t1",
      { headers: { authorization: await bearer(keyset) } },
      envWithIssuer(),
    );
    expect(res.status).toBe(404);
  });

  it("rejects a token without the custom-domains scope", async () => {
    const adapter = makeAuthoritativeAdapter();
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains?tenant_id=t1",
      {
        headers: {
          authorization: await bearer(keyset, {
            scope: PROXY_RESOLVE_HOST_SCOPE,
          }),
        },
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a token with the scope but no tenant binding", async () => {
    // Every shard holds this scope, so a token that doesn't say WHICH tenant it
    // speaks for must not be able to act on any tenant's domains.
    const adapter = makeAuthoritativeAdapter();
    const { app, keyset } = await setup(adapter);

    const res = await app.request(
      "/custom-domains?tenant_id=t1",
      {
        headers: { authorization: await bearer(keyset, { tenantId: null }) },
      },
      envWithIssuer(),
    );
    expect(res.status).toBe(403);
  });

  describe("tenant isolation — a shard may only touch its own domains", () => {
    // The token says t-attacker; every request names t-victim.
    async function attacker(keyset: TestKeyset) {
      return bearer(keyset, { tenantId: "t-attacker" });
    }

    function victimAdapter() {
      return makeAuthoritativeAdapter([
        { tenant_id: "t-victim", domain: domain() },
      ]);
    }

    it("refuses to list another tenant's domains", async () => {
      const adapter = victimAdapter();
      const { app, keyset } = await setup(adapter);

      const res = await app.request(
        "/custom-domains?tenant_id=t-victim",
        { headers: { authorization: await attacker(keyset) } },
        envWithIssuer(),
      );
      expect(res.status).toBe(403);
      expect(adapter.list).not.toHaveBeenCalled();
    });

    it("refuses to read another tenant's domain", async () => {
      const adapter = victimAdapter();
      const { app, keyset } = await setup(adapter);

      const res = await app.request(
        "/custom-domains/cd-1?tenant_id=t-victim",
        { headers: { authorization: await attacker(keyset) } },
        envWithIssuer(),
      );
      expect(res.status).toBe(403);
      expect(adapter.get).not.toHaveBeenCalled();
    });

    it("refuses to delete another tenant's domain", async () => {
      const adapter = victimAdapter();
      const { app, keyset } = await setup(adapter);

      const res = await app.request(
        "/custom-domains/cd-1?tenant_id=t-victim",
        {
          method: "DELETE",
          headers: { authorization: await attacker(keyset) },
        },
        envWithIssuer(),
      );
      expect(res.status).toBe(403);
      expect(adapter.remove).not.toHaveBeenCalled();
    });

    it("refuses to patch another tenant's domain", async () => {
      const adapter = victimAdapter();
      const { app, keyset } = await setup(adapter);

      const res = await app.request(
        "/custom-domains/cd-1",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: await attacker(keyset),
          },
          body: JSON.stringify({
            tenant_id: "t-victim",
            tls_policy: "recommended",
          }),
        },
        envWithIssuer(),
      );
      expect(res.status).toBe(403);
      expect(adapter.update).not.toHaveBeenCalled();
    });

    it("refuses to create a domain for another tenant", async () => {
      const adapter = victimAdapter();
      const { app, keyset } = await setup(adapter);

      const res = await app.request(
        "/custom-domains",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: await attacker(keyset),
          },
          body: JSON.stringify({
            tenant_id: "t-victim",
            domain: "new.acme.com",
            type: "auth0_managed_certs",
          }),
        },
        envWithIssuer(),
      );
      expect(res.status).toBe(403);
      expect(adapter.create).not.toHaveBeenCalled();
    });

    it("refuses to upload a certificate for another tenant", async () => {
      const adapter = victimAdapter();
      adapter.uploadCertificate = vi.fn();
      const { app, keyset } = await setup(adapter);

      const res = await app.request(
        "/custom-domains/cd-1/certificate",
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            authorization: await attacker(keyset),
          },
          body: JSON.stringify({
            tenant_id: "t-victim",
            certificate:
              "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n",
            private_key:
              "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
          }),
        },
        envWithIssuer(),
      );
      expect(res.status).toBe(403);
      expect(adapter.uploadCertificate).not.toHaveBeenCalled();
    });

    it("acts on the token's tenant, never the one named in the request", async () => {
      const adapter = makeAuthoritativeAdapter();
      const { app, keyset } = await setup(adapter);

      // No tenant_id in the body at all — the token is the only source.
      const res = await app.request(
        "/custom-domains",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: await attacker(keyset),
          },
          body: JSON.stringify({
            domain: "new.acme.com",
            type: "auth0_managed_certs",
          }),
        },
        envWithIssuer(),
      );

      expect(res.status).toBe(201);
      expect(adapter.create).toHaveBeenCalledWith(
        "t-attacker",
        expect.objectContaining({ domain: "new.acme.com" }),
      );
    });
  });

  it("refuses a PATCH that tries to forge lifecycle state or move the hostname", async () => {
    // A permissive partial schema would let a caller set status: "ready" or
    // repoint `domain` at a hostname it never registered.
    const adapter = makeAuthoritativeAdapter([
      { tenant_id: "t1", domain: domain() },
    ]);
    const { app, keyset } = await setup(adapter);

    for (const forged of [
      { status: "ready" },
      { domain: "victim.acme.com" },
      { custom_domain_id: "cd-other" },
      { verification: { methods: [] } },
    ]) {
      const res = await app.request(
        "/custom-domains/cd-1",
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            authorization: await bearer(keyset),
          },
          body: JSON.stringify({ tenant_id: "t1", ...forged }),
        },
        envWithIssuer(),
      );
      expect(res.status).toBe(400);
    }
    expect(adapter.update).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    const adapter = makeAuthoritativeAdapter();
    const { app } = await setup(adapter);

    const res = await app.request(
      "/custom-domains?tenant_id=t1",
      {},
      envWithIssuer(),
    );
    expect(res.status).toBe(401);
  });
});
