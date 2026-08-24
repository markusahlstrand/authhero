import { describe, it, expect } from "vitest";
import { X509Certificate } from "@peculiar/x509";
import {
  createX509Certificate,
  renewX509Certificate,
  MAX_CERT_VALIDITY_DAYS,
} from "../../src/utils/encryption";
import { pemToBuffer } from "../../src/utils/crypto";

const DAY = 24 * 60 * 60 * 1000;

function validityDays(certPem: string): number {
  const cert = new X509Certificate(certPem);
  return Math.round((cert.notAfter.getTime() - cert.notBefore.getTime()) / DAY);
}

describe("createX509Certificate", () => {
  it("defaults to a one-year certificate", async () => {
    const key = await createX509Certificate({ name: "CN=test" });
    expect(validityDays(key.cert)).toBe(365);
  });

  it("honours an explicit lifetime", async () => {
    const key = await createX509Certificate({
      name: "CN=test",
      validityDays: 5 * 365,
    });
    expect(validityDays(key.cert)).toBe(5 * 365);
  });

  it("rejects a lifetime outside the supported range", async () => {
    await expect(
      createX509Certificate({ name: "CN=test", validityDays: 0 }),
    ).rejects.toThrow(/validityDays/);
    await expect(
      createX509Certificate({
        name: "CN=test",
        validityDays: MAX_CERT_VALIDITY_DAYS + 1,
      }),
    ).rejects.toThrow(/validityDays/);
  });
});

describe("renewX509Certificate", () => {
  it("re-issues over the same key pair, keeping the public key identity", async () => {
    const original = await createX509Certificate({
      name: "CN=vimeo",
      validityDays: 1,
    });

    const renewed = await renewX509Certificate({
      cert: original.cert,
      pkcs7: original.pkcs7!,
      validityDays: 5 * 365,
    });

    // The public key is untouched, so the RFC 7638 fingerprint — and with it
    // the kid a service provider or JWKS consumer keyed on — is unchanged.
    expect(renewed.fingerprint).toBe(original.fingerprint);
    // The certificate bytes did change, so its SHA-1 thumbprint must too.
    expect(renewed.thumbprint).not.toBe(original.thumbprint);
    expect(validityDays(renewed.cert)).toBe(5 * 365);
    expect(new X509Certificate(renewed.cert).subject).toBe(
      new X509Certificate(original.cert).subject,
    );
  });

  it("produces a certificate that verifies signatures from the original key", async () => {
    const original = await createX509Certificate({ name: "CN=vimeo" });
    const renewed = await renewX509Certificate({
      cert: original.cert,
      pkcs7: original.pkcs7!,
    });

    const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pemToBuffer(original.pkcs7!),
      algorithm,
      false,
      ["sign"],
    );
    const payload = new TextEncoder().encode("<samlp:Response/>");
    const signature = await crypto.subtle.sign(
      algorithm.name,
      privateKey,
      payload,
    );

    const publicKey = await new X509Certificate(
      renewed.cert,
    ).publicKey.export();
    expect(
      await crypto.subtle.verify(algorithm.name, publicKey, signature, payload),
    ).toBe(true);
  });

  it("refuses to renew when the certificate and private key don't match", async () => {
    const a = await createX509Certificate({ name: "CN=a" });
    const b = await createX509Certificate({ name: "CN=b" });

    await expect(
      renewX509Certificate({ cert: a.cert, pkcs7: b.pkcs7! }),
    ).rejects.toThrow(/does not match/);
  });

  it("renews an EC key pair", async () => {
    const original = await createX509Certificate({
      name: "CN=ec",
      keyType: "EC-P-256",
    });

    const renewed = await renewX509Certificate({
      cert: original.cert,
      pkcs7: original.pkcs7!,
      validityDays: 730,
    });

    expect(renewed.fingerprint).toBe(original.fingerprint);
    expect(validityDays(renewed.cert)).toBe(730);
  });
});
