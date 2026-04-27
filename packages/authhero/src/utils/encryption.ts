import { nanoid } from "nanoid";
import * as x509 from "@peculiar/x509";
import { encodeHex, base64, base64url } from "oslo/encoding";
import { sha256 } from "oslo/crypto";
import { SigningKey } from "@authhero/adapter-interfaces";

const RFC7638_REQUIRED_MEMBERS: Record<string, string[]> = {
  RSA: ["e", "kty", "n"],
  EC: ["crv", "kty", "x", "y"],
  oct: ["k", "kty"],
  OKP: ["crv", "kty", "x"],
};

export interface CreateX509CertificateParams {
  name: string;
}
export async function createX509Certificate(
  params: CreateX509CertificateParams,
): Promise<SigningKey> {
  const alg = {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256",
    publicExponent: new Uint8Array([1, 0, 1]),
    modulusLength: 2048,
  };
  const keys = await crypto.subtle.generateKey(alg, true, ["sign", "verify"]);

  // Generate a nanoid and convert it directly to hex
  const nanoId = nanoid();
  const serialNumber = encodeHex(new TextEncoder().encode(nanoId));

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber,
    name: params.name,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    signingAlgorithm: alg,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 2, true),
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1"], true), // serverAuth
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true,
      ),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });

  const privateKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey!);

  const pemCert = cert.toString("pem");
  const fingerprint = await getJWKThumbprint(cert);
  const thumbprint = encodeHex(await cert.getThumbprint());
  const pkcs7 = convertPKCS7ToPem("PRIVATE", privateKey);

  return {
    kid: fingerprint,
    cert: pemCert,
    thumbprint,
    fingerprint,
    pkcs7,
    type: "jwt_signing" as const,
  };
}

export function convertPKCS7ToPem(
  keyType: "PRIVATE" | "PUBLIC",
  binaryData: ArrayBuffer,
) {
  const base64Cert = base64.encode(new Uint8Array(binaryData));
  let pemCert = `-----BEGIN ${keyType} KEY-----\r\n`;
  let nextIndex = 0;

  while (nextIndex < base64Cert.length) {
    if (nextIndex + 64 <= base64Cert.length) {
      pemCert += base64Cert.substr(nextIndex, 64) + "\r\n";
    } else {
      pemCert += base64Cert.substr(nextIndex) + "\r\n";
    }
    nextIndex += 64;
  }
  pemCert += `-----END ${keyType} KEY-----\r\n`;
  return pemCert;
}

export async function toJWKS(key: CryptoKey): Promise<JsonWebKey> {
  return await crypto.subtle.exportKey("jwk", key);
}

export async function getJWKThumbprint(
  cert: x509.X509Certificate,
): Promise<string> {
  const publicKey = await cert.publicKey.export();
  const jwkKey = await crypto.subtle.exportKey("jwk", publicKey);
  return computeJWKThumbprint(jwkKey);
}

// RFC 7638 §3: SHA-256 of a canonical JSON serialization that contains
// only the required public-key members for the kty, in lexicographic
// order, with no whitespace, encoded as base64url without padding.
export async function computeJWKThumbprint(jwk: JsonWebKey): Promise<string> {
  if (!jwk.kty) {
    throw new Error("JWK is missing required 'kty' member");
  }
  const required = RFC7638_REQUIRED_MEMBERS[jwk.kty];
  if (!required) {
    throw new Error(`Unsupported JWK kty for thumbprint: ${jwk.kty}`);
  }

  const canonical: Record<string, string> = {};
  for (const member of required) {
    const value = (jwk as Record<string, unknown>)[member];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `JWK is missing required member '${member}' for kty=${jwk.kty}`,
      );
    }
    canonical[member] = value;
  }

  const json = JSON.stringify(canonical);
  const digest = await sha256(new TextEncoder().encode(json));
  return base64url.encode(new Uint8Array(digest), { includePadding: false });
}
