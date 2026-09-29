import { describe, it, expect } from "vitest";
import * as x509 from "@peculiar/x509";
import {
  createX509Certificate,
  renewX509Certificate,
} from "../../src/utils/encryption";
import {
  CertificateIssuer,
  certificateAuthorityIssuance,
  certificateChainMembers,
} from "../../src/helpers/signing-certificate-authority";
import { chainLength, createTestSigningCa, sanUris } from "./signing-ca";

describe("CA-issued signing certificates", () => {
  it("issues a leaf that chains to the root and names its tenant", async () => {
    const ca = await createTestSigningCa();

    const key = await createX509Certificate({
      name: "CN=acme",
      validityDays: 30,
      certificateAuthority: {
        issuer: ca.issuer,
        uri: "urn:authhero:tenant:acme",
      },
    });
    const leaf = new x509.X509Certificate(key.cert);

    expect(leaf.subject).toBe("CN=acme");
    expect(leaf.issuer).toBe(ca.intermediate.subject);
    expect(sanUris(leaf)).toEqual(["urn:authhero:tenant:acme"]);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);

    const constraints = leaf.getExtension(x509.BasicConstraintsExtension);
    expect(constraints?.ca).toBe(false);
    const usages = leaf.getExtension(x509.KeyUsagesExtension);
    expect(usages?.usages).toBe(x509.KeyUsageFlags.digitalSignature);

    const lifetimeDays =
      (leaf.notAfter.getTime() - leaf.notBefore.getTime()) / 86_400_000;
    expect(Math.round(lifetimeDays)).toBe(30);
  });

  it("keeps the kid and the chain when renewing from the CA", async () => {
    const ca = await createTestSigningCa();
    const issuance = { issuer: ca.issuer, uri: "urn:authhero:tenant:acme" };
    const key = await createX509Certificate({
      name: "CN=acme",
      certificateAuthority: issuance,
    });

    const renewed = await renewX509Certificate({
      cert: key.cert,
      pkcs7: key.pkcs7!,
      validityDays: 7,
      certificateAuthority: issuance,
    });
    const leaf = new x509.X509Certificate(renewed.cert);

    expect(renewed.fingerprint).toBe(key.kid);
    expect(renewed.cert).not.toBe(key.cert);
    expect(sanUris(leaf)).toEqual(["urn:authhero:tenant:acme"]);
    expect(await chainLength(leaf, ca.intermediate, ca.root)).toBe(3);
  });

  it("rejects a certificate the CA issued for a different key", async () => {
    const ca = await createTestSigningCa();
    const other = await createX509Certificate({
      name: "CN=other",
      certificateAuthority: { issuer: ca.issuer, uri: "urn:x" },
    });
    const wrongIssuer: CertificateIssuer = {
      issueCertificate: async () => other.cert,
      getIssuerCertificates: ca.issuer.getIssuerCertificates,
    };

    await expect(
      createX509Certificate({
        name: "CN=acme",
        certificateAuthority: { issuer: wrongIssuer, uri: "urn:x" },
      }),
    ).rejects.toThrow(/different key/);
  });

  it("stays self-signed without a CA", async () => {
    const key = await createX509Certificate({ name: "CN=acme" });
    const cert = new x509.X509Certificate(key.cert);

    expect(cert.issuer).toBe(cert.subject);
    expect(await certificateChainMembers(cert, [])).toBeUndefined();
  });
});

describe("certificateChainMembers", () => {
  it("returns x5c (leaf, intermediate) and x5t#S256", async () => {
    const ca = await createTestSigningCa();
    const key = await createX509Certificate({
      name: "CN=acme",
      certificateAuthority: { issuer: ca.issuer, uri: "urn:x" },
    });
    const leaf = new x509.X509Certificate(key.cert);

    const members = await certificateChainMembers(leaf, [ca.intermediate]);

    expect(members?.x5c).toHaveLength(2);
    expect(new x509.X509Certificate(members!.x5c[0]!).equal(leaf)).toBe(true);
    expect(
      new x509.X509Certificate(members!.x5c[1]!).equal(ca.intermediate),
    ).toBe(true);
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", leaf.rawData),
    );
    expect(members!["x5t#S256"]).toBe(
      Buffer.from(digest).toString("base64url"),
    );
  });

  it("publishes no chain when the signing intermediate is unknown", async () => {
    const ca = await createTestSigningCa("A");
    // Same subject, different key: the name matches but the signature doesn't.
    const impostor = await createTestSigningCa("A");
    const key = await createX509Certificate({
      name: "CN=acme",
      certificateAuthority: { issuer: ca.issuer, uri: "urn:x" },
    });
    const leaf = new x509.X509Certificate(key.cert);

    expect(
      await certificateChainMembers(leaf, [impostor.intermediate]),
    ).toBeUndefined();
    expect(
      await certificateChainMembers(leaf, [
        impostor.intermediate,
        ca.intermediate,
      ]),
    ).toBeDefined();
  });
});

describe("certificateAuthorityIssuance", () => {
  const issuer: CertificateIssuer = {
    issueCertificate: async () => "",
    getIssuerCertificates: async () => [],
  };

  it("binds tenant keys to the tenant and shared keys to the control plane", () => {
    expect(
      certificateAuthorityIssuance(
        { issuer },
        { type: "jwt_signing", tenant_id: "acme" },
      )?.uri,
    ).toBe("urn:authhero:tenant:acme");
    expect(
      certificateAuthorityIssuance({ issuer }, { type: "jwt_signing" })?.uri,
    ).toBe("urn:authhero:control-plane");
  });

  it("lets the deployment override the SAN", () => {
    expect(
      certificateAuthorityIssuance(
        { issuer, subjectUri: () => "urn:authhero:tenant:wfp-tenant" },
        { type: "jwt_signing" },
      )?.uri,
    ).toBe("urn:authhero:tenant:wfp-tenant");
  });

  it("never CA-issues SAML keys", () => {
    expect(
      certificateAuthorityIssuance({ issuer }, { type: "saml_encryption" }),
    ).toBeUndefined();
    expect(
      certificateAuthorityIssuance(undefined, { type: "jwt_signing" }),
    ).toBeUndefined();
  });
});
