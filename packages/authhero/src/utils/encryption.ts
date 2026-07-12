import { nanoid } from "nanoid";
import * as x509 from "@peculiar/x509";
import { getRuntimeKey } from "hono/adapter";
import {
  SigningKey,
  encodeBase64Url,
  encodeBase64,
  encodeHex,
} from "@authhero/adapter-interfaces";

const RFC7638_REQUIRED_MEMBERS: Record<string, string[]> = {
  RSA: ["e", "kty", "n"],
  EC: ["crv", "kty", "x", "y"],
  oct: ["k", "kty"],
  OKP: ["crv", "kty", "x"],
};

/**
 * Supported signing-key shapes. Note: `EC-P-521` is not supported on
 * Cloudflare Workers (`workerd`) — `crypto.subtle.generateKey` will reject
 * `{ name: "ECDSA", namedCurve: "P-521" }` there. Callers running on Workers
 * must pick `RSA`, `EC-P-256`, or `EC-P-384`.
 */
export type SigningKeyType = "RSA" | "EC-P-256" | "EC-P-384" | "EC-P-521";

export interface CreateX509CertificateParams {
  name: string;
  /**
   * The key type to generate. Defaults to "RSA" (RS256-compatible) for
   * backwards compatibility with existing tenants.
   */
  keyType?: SigningKeyType;
}

/**
 * Map a `SigningKeyType` to the WebCrypto `generateKey` parameters.
 *
 * The `EC-P-521` entry returns `{ name: "ECDSA", namedCurve: "P-521" }`. That
 * curve is unsupported on Cloudflare Workers — see `SigningKeyType` and the
 * runtime guard in `createX509Certificate` for details.
 */
function genAlgForKeyType(
  keyType: SigningKeyType,
): RsaHashedKeyGenParams | EcKeyGenParams {
  switch (keyType) {
    case "RSA":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048,
      };
    case "EC-P-256":
      return { name: "ECDSA", namedCurve: "P-256" };
    case "EC-P-384":
      return { name: "ECDSA", namedCurve: "P-384" };
    case "EC-P-521":
      return { name: "ECDSA", namedCurve: "P-521" };
  }
}

function signingAlgForKeyType(
  keyType: SigningKeyType,
): RsaHashedKeyGenParams | EcdsaParams {
  switch (keyType) {
    case "RSA":
      return {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
        publicExponent: new Uint8Array([1, 0, 1]),
        modulusLength: 2048,
      };
    case "EC-P-256":
      return { name: "ECDSA", hash: "SHA-256" };
    case "EC-P-384":
      return { name: "ECDSA", hash: "SHA-384" };
    case "EC-P-521":
      return { name: "ECDSA", hash: "SHA-512" };
  }
}

export async function createX509Certificate(
  params: CreateX509CertificateParams,
): Promise<SigningKey> {
  const keyType = params.keyType ?? "RSA";

  if (keyType === "EC-P-521" && getRuntimeKey() === "workerd") {
    throw new Error(
      "EC-P-521 signing keys are not supported on Cloudflare Workers: " +
        "workerd's WebCrypto implementation cannot generate the P-521 curve. " +
        "Use RSA, EC-P-256, or EC-P-384 instead.",
    );
  }

  const keys = await crypto.subtle.generateKey(
    genAlgForKeyType(keyType),
    true,
    ["sign", "verify"],
  );

  // Generate a nanoid and convert it directly to hex
  const nanoId = nanoid();
  const serialNumber = encodeHex(new TextEncoder().encode(nanoId));

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber,
    name: params.name,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
    signingAlgorithm: signingAlgForKeyType(keyType),
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
  const base64Cert = encodeBase64(new Uint8Array(binaryData));
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
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(json),
  );
  return encodeBase64Url(new Uint8Array(digest));
}
