import { nanoid } from "nanoid";
import * as x509 from "@peculiar/x509";
import { getRuntimeKey } from "hono/adapter";
import { pemToBuffer } from "./crypto";
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
  /**
   * How long the certificate stays valid, in days. Defaults to
   * `DEFAULT_CERT_VALIDITY_DAYS` (one year).
   *
   * Relying parties that fetch JWKS re-read the key on every rotation, so a
   * short life is cheap there. A SAML service provider, by contrast, pins the
   * certificate out-of-band and only learns about a new one when someone
   * emails it over — so SAML keys want years, not months.
   */
  validityDays?: number;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Default certificate lifetime when a caller doesn't ask for one. */
export const DEFAULT_CERT_VALIDITY_DAYS = 365;

/**
 * Upper bound on a caller-supplied lifetime. Ten years is already generous for
 * a signing certificate; beyond that the value is far more likely to be a
 * mistake than an intention.
 */
export const MAX_CERT_VALIDITY_DAYS = 3650;

function certNotAfter(validityDays?: number): Date {
  const days = validityDays ?? DEFAULT_CERT_VALIDITY_DAYS;
  if (!Number.isFinite(days) || days < 1 || days > MAX_CERT_VALIDITY_DAYS) {
    throw new Error(
      `validityDays must be between 1 and ${MAX_CERT_VALIDITY_DAYS}`,
    );
  }
  return new Date(Date.now() + days * MS_PER_DAY);
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
    notAfter: certNotAfter(params.validityDays),
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

export interface RenewX509CertificateParams {
  /**
   * The key's current certificate. Supplies the subject CN to carry over and
   * the public key we assert the private key still matches.
   */
  cert: string;
  /** The key's private key, PEM-encoded (the `pkcs7` column). */
  pkcs7: string;
  /** Subject/issuer CN for the new certificate. Defaults to the current CN. */
  name?: string;
  validityDays?: number;
}

export interface RenewX509CertificateResult {
  /** The re-issued certificate, PEM-encoded. */
  cert: string;
  /** SHA-1 of the new certificate's DER — changes, the cert bytes changed. */
  thumbprint: string;
  /** RFC 7638 thumbprint of the public key — unchanged by definition. */
  fingerprint: string;
}

/** Key types we can round-trip through `crypto.subtle.importKey`. */
const RENEWABLE_KEY_TYPES: SigningKeyType[] = [
  "RSA",
  "EC-P-256",
  "EC-P-384",
  "EC-P-521",
];

/**
 * Import a PEM private key by trying each supported algorithm in turn.
 *
 * A PKCS#8 blob doesn't tell WebCrypto which algorithm to import it as, and
 * the stored row doesn't record the key type, so we probe. The list is short
 * and an import either succeeds or throws immediately.
 */
async function importPrivateKey(
  pkcs7: string,
): Promise<{ key: CryptoKey; keyType: SigningKeyType }> {
  const der = pemToBuffer(pkcs7);
  for (const keyType of RENEWABLE_KEY_TYPES) {
    try {
      const key = await crypto.subtle.importKey(
        "pkcs8",
        der,
        genAlgForKeyType(keyType),
        true,
        ["sign"],
      );
      return { key, keyType };
    } catch {
      // Wrong algorithm for this blob — try the next one.
    }
  }
  throw new Error(
    "Unable to import the private key: not a supported RSA or EC key",
  );
}

/** Strip the private members from a JWK, leaving the public key. */
function publicMembersOf(jwk: JsonWebKey): JsonWebKey {
  const require = (value: string | undefined, member: string): string => {
    if (!value) {
      throw new Error(`JWK is missing required member '${member}'`);
    }
    return value;
  };

  switch (jwk.kty) {
    case "RSA":
      return {
        kty: "RSA",
        n: require(jwk.n, "n"),
        e: require(jwk.e, "e"),
      };
    case "EC":
      return {
        kty: "EC",
        crv: require(jwk.crv, "crv"),
        x: require(jwk.x, "x"),
        y: require(jwk.y, "y"),
      };
    case "OKP":
      return {
        kty: "OKP",
        crv: require(jwk.crv, "crv"),
        x: require(jwk.x, "x"),
      };
    default:
      throw new Error(`Unsupported JWK kty: ${jwk.kty}`);
  }
}

/**
 * Re-issue a certificate over an existing key pair.
 *
 * This is renewal, not rotation: the key material is untouched, so the public
 * key, its RFC 7638 fingerprint and therefore the `kid` all stay the same —
 * only the validity window (and the certificate bytes carrying it) move. A
 * SAML service provider that validates against the public key it already
 * holds keeps working with no coordination at all; one that pinned the
 * certificate itself still needs the new bytes, same as a full rotation.
 *
 * Use `createX509Certificate` when you actually want new key material.
 */
export async function renewX509Certificate(
  params: RenewX509CertificateParams,
): Promise<RenewX509CertificateResult> {
  const existingCert = new x509.X509Certificate(params.cert);
  const { key: privateKey, keyType } = await importPrivateKey(params.pkcs7);

  const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
  const publicJwk = publicMembersOf(privateJwk);
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    publicJwk,
    genAlgForKeyType(keyType),
    true,
    ["verify"],
  );

  // Guard against a row whose cert and private key have drifted apart: renewing
  // from a mismatched pair would mint a certificate nothing can verify against,
  // and the failure would only surface at the service provider.
  const fingerprint = await computeJWKThumbprint(publicJwk);
  if (fingerprint !== (await getJWKThumbprint(existingCert))) {
    throw new Error(
      "The stored private key does not match the stored certificate",
    );
  }

  const serialNumber = encodeHex(new TextEncoder().encode(nanoid()));
  const name = params.name || existingCert.subject;

  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber,
    name,
    notBefore: new Date(),
    notAfter: certNotAfter(params.validityDays),
    signingAlgorithm: signingAlgForKeyType(keyType),
    keys: { privateKey, publicKey },
    extensions: [
      new x509.BasicConstraintsExtension(true, 2, true),
      new x509.ExtendedKeyUsageExtension(["1.3.6.1.5.5.7.3.1"], true), // serverAuth
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true,
      ),
      await x509.SubjectKeyIdentifierExtension.create(publicKey),
    ],
  });

  return {
    cert: cert.toString("pem"),
    thumbprint: encodeHex(await cert.getThumbprint()),
    fingerprint,
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
