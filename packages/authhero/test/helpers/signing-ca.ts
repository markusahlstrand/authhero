import * as x509 from "@peculiar/x509";
import { convertPKCS7ToPem } from "../../src/utils/encryption";
import { createLocalCertificateIssuer } from "../../src/helpers/signing-certificate-authority";

const RSA: RsaHashedKeyGenParams = {
  name: "RSASSA-PKCS1-v1_5",
  hash: "SHA-256",
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048,
};

async function caCertificate(params: {
  name: string;
  keys: CryptoKeyPair;
  issuer?: { cert: x509.X509Certificate; keys: CryptoKeyPair };
}): Promise<x509.X509Certificate> {
  const extensions = [
    new x509.BasicConstraintsExtension(true, undefined, true),
    new x509.KeyUsagesExtension(
      x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
      true,
    ),
    await x509.SubjectKeyIdentifierExtension.create(params.keys.publicKey),
  ];
  if (!params.issuer) {
    return x509.X509CertificateGenerator.createSelfSigned({
      name: params.name,
      keys: params.keys,
      signingAlgorithm: RSA,
      notAfter: new Date(Date.now() + 365 * 86_400_000),
      extensions,
    });
  }
  return x509.X509CertificateGenerator.create({
    subject: params.name,
    issuer: params.issuer.cert.subject,
    publicKey: params.keys.publicKey,
    signingKey: params.issuer.keys.privateKey,
    signingAlgorithm: RSA,
    notAfter: new Date(Date.now() + 365 * 86_400_000),
    extensions,
  });
}

/**
 * A root → intermediate hierarchy plus a local issuer backed by the
 * intermediate, the way a deployment would set it up.
 */
export async function createTestSigningCa(name = "Test") {
  const rootKeys = await crypto.subtle.generateKey(RSA, true, [
    "sign",
    "verify",
  ]);
  const root = await caCertificate({ name: `CN=${name} Root`, keys: rootKeys });

  const intermediateKeys = await crypto.subtle.generateKey(RSA, true, [
    "sign",
    "verify",
  ]);
  const intermediate = await caCertificate({
    name: `CN=${name} Intermediate`,
    keys: intermediateKeys,
    issuer: { cert: root, keys: rootKeys },
  });
  const intermediateKeyPem = convertPKCS7ToPem(
    "PRIVATE",
    await crypto.subtle.exportKey("pkcs8", intermediateKeys.privateKey),
  );

  return {
    root,
    intermediate,
    issuer: createLocalCertificateIssuer({
      certificate: intermediate.toString("pem"),
      privateKey: intermediateKeyPem,
    }),
  };
}

/** Build leaf → intermediate → root; returns the chain length (3 = valid). */
export async function chainLength(
  leaf: x509.X509Certificate,
  ...certificates: x509.X509Certificate[]
): Promise<number> {
  const chain = await new x509.X509ChainBuilder({ certificates }).build(leaf);
  return chain.length;
}

export function sanUris(cert: x509.X509Certificate): string[] {
  const san = cert.getExtension(x509.SubjectAlternativeNameExtension);
  return (san?.names.toJSON() ?? [])
    .filter((name) => name.type === "url")
    .map((name) => name.value);
}
