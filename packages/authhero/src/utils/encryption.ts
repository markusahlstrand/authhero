import { nanoid } from "nanoid";
import * as x509 from "@peculiar/x509";
import { encodeHex, base64 } from "oslo/encoding";
import { sha256 } from "oslo/crypto";
import { SigningKey } from "@authhero/adapter-interfaces";

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
  const fingerprint = await getJWKFingerprint(cert);
  const thumbprint = encodeHex(await cert.getThumbprint());
  const pkcs7 = convertPKCS7ToPem("PRIVATE", privateKey);

  return {
    kid: cert.serialNumber,
    cert: pemCert,
    thumbprint,
    fingerprint,
    pkcs7,
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

export async function getJWKFingerprint(cert: x509.X509Certificate) {
  const publicKey = await cert.publicKey.export();
  const jwkKey = await crypto.subtle.exportKey("jwk", publicKey);

  // Create a canonical JSON representation
  const canonicalJWK = JSON.stringify(jwkKey, Object.keys(jwkKey).sort());

  // Convert the string to an ArrayBuffer using TextEncoder
  const encoder = new TextEncoder();
  const data = encoder.encode(canonicalJWK);

  return encodeHex(await sha256(data));
}
