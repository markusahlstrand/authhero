import { jwksSchema, DataAdapters } from "@authhero/adapter-interfaces";
import { X509Certificate } from "@peculiar/x509";

/**
 * Helper function to fetch JWKS keys from the database
 * This can be used when JWKS_URL is not available or when running outside Cloudflare
 */
export async function getJwksFromDatabase(data: DataAdapters) {
  const signingKeys = await data.keys.list();
  const keys = await Promise.all(
    signingKeys.map(async (signingKey) => {
      const importedCert = new X509Certificate(signingKey.cert);
      const publicKey = await importedCert.publicKey.export();
      const jwkKey = await crypto.subtle.exportKey("jwk", publicKey);

      return jwksSchema.parse({
        ...jwkKey,
        kid: signingKey.kid,
      });
    }),
  );

  return keys;
}
