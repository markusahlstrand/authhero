import * as x509 from "@peculiar/x509";
import { encodeBase64, encodeBase64Url } from "@authhero/adapter-interfaces";
import { importPrivateKey, signingAlgForKeyType } from "../utils/encryption";

/**
 * A request to certify a signing key. Everything is plain data so an issuer
 * can forward it over HTTP: the CA key never has to live in the auth worker.
 */
export interface SigningCertificateRequest {
  /** The key to certify, as an SPKI `PUBLIC KEY` PEM. */
  publicKey: string;
  /** Subject distinguished name, e.g. `CN=acme`. */
  subject: string;
  /** URI placed in the SubjectAlternativeName, e.g. `urn:authhero:tenant:acme`. */
  uri: string;
  notBefore: Date;
  notAfter: Date;
}

/**
 * Issues signing-key certificates from an intermediate CA.
 *
 * `issueCertificate` returns the leaf only. `getIssuerCertificates` returns
 * every intermediate that may have signed a leaf that is still published —
 * the current one plus any that were rotated out recently — so the JWKS can
 * attach the right chain to each key.
 */
export interface CertificateIssuer {
  issueCertificate(request: SigningCertificateRequest): Promise<string>;
  getIssuerCertificates(): Promise<string[]>;
}

export interface SigningCertificateAuthority {
  issuer: CertificateIssuer;
  /**
   * Lifetime of issued certificates, in days. Renewal keeps the key and the
   * `kid`, so short lifetimes are cheap.
   *
   * @default 30
   */
  validityDays?: number;
  /**
   * The SAN URI that binds a key to its owner. Receives the key's `tenant_id`,
   * which is undefined for control-plane keys.
   *
   * Override this where the storage scope doesn't match ownership — a WFP
   * tenant worker stores its own keys without a `tenant_id`.
   *
   * @default tenant keys → `urn:authhero:tenant:<tenant_id>`, control-plane
   * keys → `urn:authhero:control-plane`
   */
  subjectUri?: (scope: { tenant_id?: string }) => string;
}

export const DEFAULT_CA_CERT_VALIDITY_DAYS = 30;
export const TENANT_URI_PREFIX = "urn:authhero:tenant:";
export const CONTROL_PLANE_URI = "urn:authhero:control-plane";

function defaultSubjectUri({ tenant_id }: { tenant_id?: string }): string {
  return tenant_id ? `${TENANT_URI_PREFIX}${tenant_id}` : CONTROL_PLANE_URI;
}

/** Parameters `createX509Certificate` / `renewX509Certificate` need to issue from the CA. */
export interface CertificateAuthorityIssuance {
  issuer: CertificateIssuer;
  uri: string;
}

/**
 * Resolve how a key should be certified. Only `jwt_signing` keys are
 * CA-issued: SAML service providers pin certificates for years and gain
 * nothing from a chain.
 */
export function certificateAuthorityIssuance(
  ca: SigningCertificateAuthority | undefined,
  key: { type: string; tenant_id?: string },
): CertificateAuthorityIssuance | undefined {
  if (!ca || key.type !== "jwt_signing") return undefined;
  const subjectUri = ca.subjectUri ?? defaultSubjectUri;
  return { issuer: ca.issuer, uri: subjectUri({ tenant_id: key.tenant_id }) };
}

export interface LocalCertificateIssuerOptions {
  /** The issuing (intermediate) CA certificate, PEM. */
  certificate: string;
  /** The issuing CA's PKCS#8 private key, PEM. */
  privateKey: string;
  /**
   * Intermediates that were rotated out but may still have signed a
   * published leaf. They are only used to build `x5c`, never to sign.
   */
  previousCertificates?: string[];
}

/**
 * An in-process issuer holding the intermediate's private key. Keep the root
 * offline; this only ever needs the intermediate.
 */
export function createLocalCertificateIssuer(
  options: LocalCertificateIssuerOptions,
): CertificateIssuer {
  const caCert = new x509.X509Certificate(options.certificate);
  const signer = importPrivateKey(options.privateKey);

  return {
    async issueCertificate(request) {
      const { key: signingKey, keyType } = await signer;
      const publicKey = new x509.PublicKey(request.publicKey);
      const cryptoPublicKey = await publicKey.export();

      const leaf = await x509.X509CertificateGenerator.create({
        serialNumber: randomSerialNumber(),
        subject: request.subject,
        issuer: caCert.subject,
        notBefore: request.notBefore,
        notAfter: request.notAfter,
        signingAlgorithm: signingAlgForKeyType(keyType),
        publicKey,
        signingKey,
        extensions: [
          new x509.BasicConstraintsExtension(false, undefined, true),
          new x509.KeyUsagesExtension(
            x509.KeyUsageFlags.digitalSignature,
            true,
          ),
          new x509.SubjectAlternativeNameExtension([
            { type: "url", value: request.uri },
          ]),
          await x509.SubjectKeyIdentifierExtension.create(cryptoPublicKey),
          await x509.AuthorityKeyIdentifierExtension.create(caCert.publicKey),
        ],
      });
      return leaf.toString("pem");
    },

    async getIssuerCertificates() {
      return [options.certificate, ...(options.previousCertificates ?? [])];
    },
  };
}

function randomSerialNumber(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Clear the top bit so the DER INTEGER stays positive.
  bytes[0] = (bytes[0] ?? 0) & 0x7f;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True when the certificate was issued by someone other than itself. */
export function isCaIssued(cert: x509.X509Certificate): boolean {
  return cert.issuer !== cert.subject;
}

/**
 * The published chain for a CA-issued certificate: `x5c` (leaf first, then
 * its issuer, standard base64 DER per RFC 7517 §4.7) and `x5t#S256`.
 *
 * The issuer is matched by name *and* by verifying the leaf's signature, so a
 * CA that computes key identifiers differently can't produce a wrong chain.
 * Returns undefined for self-signed certificates and when no known
 * intermediate signed the leaf — publishing no chain beats publishing a
 * wrong one.
 */
export async function certificateChainMembers(
  cert: x509.X509Certificate,
  issuerCertificates: x509.X509Certificate[],
): Promise<{ x5c: string[]; "x5t#S256": string } | undefined> {
  if (!isCaIssued(cert)) return undefined;

  for (const candidate of issuerCertificates) {
    if (candidate.subject !== cert.issuer) continue;
    const signedByCandidate = await cert.verify({
      publicKey: candidate.publicKey,
      signatureOnly: true,
    });
    if (!signedByCandidate) continue;

    const leafDer = new Uint8Array(cert.rawData);
    const digest = await crypto.subtle.digest("SHA-256", leafDer);
    return {
      x5c: [
        encodeBase64(leafDer),
        encodeBase64(new Uint8Array(candidate.rawData)),
      ],
      "x5t#S256": encodeBase64Url(new Uint8Array(digest)),
    };
  }
  return undefined;
}
