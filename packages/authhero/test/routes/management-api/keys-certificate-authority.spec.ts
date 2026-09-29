import { describe, it, expect, vi } from "vitest";
import { testClient } from "hono/testing";
import * as x509 from "@peculiar/x509";
import { jwksKeySchema } from "@authhero/adapter-interfaces";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import {
  chainLength,
  createTestSigningCa,
  sanUris,
} from "../../helpers/signing-ca";
import { ensureSigningKey } from "../../../src/helpers/signing-keys";
import { SigningKeyMode } from "../../../src/types/AuthHeroConfig";

async function setup(
  options: { signingKeyMode?: SigningKeyMode; ca?: boolean } = {},
) {
  const server = await getTestServer();
  const ca = await createTestSigningCa();
  const env = {
    ...server.env,
    ...(options.signingKeyMode
      ? { signingKeyMode: options.signingKeyMode }
      : {}),
    ...(options.ca === false
      ? {}
      : { signingCertificateAuthority: { issuer: ca.issuer } }),
  };
  const token = await getAdminToken();
  const management = testClient(server.managementApp, env);
  const oauth = testClient(server.oauthApp, env);
  const auth = { headers: { authorization: `Bearer ${token}` } };
  const tenant = { header: { "tenant-id": "tenantId" } };

  return {
    env,
    ca,
    rotate: (type?: "jwt_signing" | "saml_encryption") =>
      management.keys.signing.rotate.$post(
        { ...tenant, query: type ? { type } : {} },
        auth,
      ),
    revoke: (kid: string) =>
      management.keys.signing[kid].revoke.$put({ ...tenant, query: {} }, auth),
    renew: (kid: string) =>
      management.keys.signing[kid].renew.$post({ ...tenant, query: {} }, auth),
    jwks: async () => {
      const response = await oauth[".well-known"]["jwks.json"].$get(
        { param: {} },
        { headers: { "tenant-id": "tenantId" } },
      );
      expect(response.status).toBe(200);
      return jwksKeySchema.parse(await response.json()).keys;
    },
    currentKey: async (type = "jwt_signing") => {
      const { signingKeys } = await env.data.keys.list({ q: `type:${type}` });
      const current = signingKeys
        .filter((k) => !k.revoked_at || new Date(k.revoked_at) > new Date())
        .sort((a, b) =>
          (b.current_since ?? "").localeCompare(a.current_since ?? ""),
        )[0];
      if (!current) throw new Error("no current key");
      return current;
    },
  };
}

describe("signing keys with a certificate authority", () => {
  it("issues rotated control-plane keys from the CA and publishes the chain", async () => {
    const { rotate, jwks, currentKey, ca } = await setup();

    expect((await rotate()).status).toBe(201);

    const key = await currentKey();
    const leaf = new x509.X509Certificate(key.cert);
    expect(sanUris(leaf)).toEqual(["urn:authhero:control-plane"]);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);

    const published = (await jwks()).find((jwk) => jwk.kid === key.kid);
    expect(published?.x5c).toHaveLength(2);
    expect(published?.["x5t#S256"]).toBeTruthy();
    const x5cLeaf = new x509.X509Certificate(published!.x5c![0]!);
    expect(x5cLeaf.equal(leaf)).toBe(true);
  });

  it("binds tenant-mode keys to the tenant", async () => {
    const { rotate, currentKey } = await setup({ signingKeyMode: "tenant" });

    expect((await rotate()).status).toBe(201);

    const key = await currentKey();
    expect(key.tenant_id).toBe("tenantId");
    expect(sanUris(new x509.X509Certificate(key.cert))).toEqual([
      "urn:authhero:tenant:tenantId",
    ]);
  });

  it("publishes pre-existing self-signed keys without a chain", async () => {
    const { rotate, jwks, currentKey } = await setup();
    const before = await currentKey();

    await rotate();

    // The seeded self-signed key stays in the JWKS during its grace period.
    const outgoing = (await jwks()).find((jwk) => jwk.kid === before.kid);
    expect(outgoing).toBeDefined();
    expect(outgoing?.x5c).toBeUndefined();
    expect(outgoing?.["x5t#S256"]).toBeUndefined();
  });

  it("keeps the kid and the chain when renewing a CA-issued key", async () => {
    const { rotate, renew, currentKey, ca } = await setup();
    await rotate();
    const key = await currentKey();

    expect((await renew(key.kid)).status).toBe(200);

    const renewed = await currentKey();
    expect(renewed.kid).toBe(key.kid);
    expect(renewed.cert).not.toBe(key.cert);
    const leaf = new x509.X509Certificate(renewed.cert);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);
  });

  it("still serves the JWKS, without a chain, when the CA is unreachable", async () => {
    const { rotate, jwks, currentKey, env, ca } = await setup();
    await rotate();
    const key = await currentKey();
    env.signingCertificateAuthority = {
      issuer: {
        issueCertificate: ca.issuer.issueCertificate,
        getIssuerCertificates: async () => {
          throw new Error("CA unreachable");
        },
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const published = (await jwks()).find((jwk) => jwk.kid === key.kid);

    expect(published).toBeDefined();
    expect(published?.x5c).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  function failingIssuance(
    env: { signingCertificateAuthority?: unknown },
    ca: {
      issuer: { getIssuerCertificates: () => Promise<string[]> };
    },
  ) {
    env.signingCertificateAuthority = {
      issuer: {
        issueCertificate: async () => {
          throw new Error("CA unreachable");
        },
        getIssuerCertificates: ca.issuer.getIssuerCertificates,
      },
    };
  }

  it("leaves existing keys unrevoked when rotation can't issue a certificate", async () => {
    const { rotate, currentKey, env, ca } = await setup();
    await rotate();
    const before = await currentKey();
    failingIssuance(env, ca);

    await expect(rotate()).rejects.toThrow(/CA unreachable/);
    const after = await env.data.keys.list({ q: "type:jwt_signing" });
    const key = after.signingKeys.find((k) => k.kid === before.kid);
    expect(key?.revoked_at).toBeFalsy();
  });

  it("leaves the key in service when revoke-and-replace can't issue a certificate", async () => {
    const { rotate, revoke, currentKey, env, ca } = await setup();
    await rotate();
    const before = await currentKey();
    failingIssuance(env, ca);

    await expect(revoke(before.kid)).rejects.toThrow(/CA unreachable/);
    expect((await currentKey()).kid).toBe(before.kid);
  });

  it("keeps SAML keys self-signed", async () => {
    const { rotate, currentKey } = await setup();

    expect((await rotate("saml_encryption")).status).toBe(201);

    const cert = new x509.X509Certificate(
      (await currentKey("saml_encryption")).cert,
    );
    expect(cert.issuer).toBe(cert.subject);
  });

  it("publishes no chain without a CA", async () => {
    const { rotate, jwks } = await setup({ ca: false });

    await rotate();

    for (const jwk of await jwks()) {
      expect(jwk.x5c).toBeUndefined();
      expect(jwk["x5t#S256"]).toBeUndefined();
    }
  });

  it("issues keys minted by ensureSigningKey from the CA", async () => {
    const { env, ca } = await setup();

    const { created, key } = await ensureSigningKey(env.data.keys, {
      tenantId: "tenantId",
      certificateAuthority: { issuer: ca.issuer, validityDays: 7 },
    });

    expect(created).toBe(true);
    const leaf = new x509.X509Certificate(key.cert);
    expect(sanUris(leaf)).toEqual(["urn:authhero:tenant:tenantId"]);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);
  });
});
