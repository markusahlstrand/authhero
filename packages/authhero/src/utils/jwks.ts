import {
  jwksSchema,
  DataAdapters,
  SigningKey,
} from "@authhero/adapter-interfaces";
import { X509Certificate } from "@peculiar/x509";
import { algForJwk } from "./jwk-alg";
import {
  listControlPlaneKeys,
  resolveSigningKeys,
} from "../helpers/signing-keys";
import { SigningKeyModeOption } from "../types/AuthHeroConfig";

async function signingKeysToJwks(signingKeys: SigningKey[]) {
  return Promise.all(
    signingKeys.map(async (signingKey) => {
      const importedCert = new X509Certificate(signingKey.cert);
      const publicKey = await importedCert.publicKey.export();
      const jwkKey = (await crypto.subtle.exportKey(
        "jwk",
        publicKey,
      )) as JsonWebKey & { kty: string };

      // WebCrypto omits `alg` from EC JWKs; derive it from kty + crv so the
      // published JWKS lets clients verify without guessing.
      const alg = jwkKey.alg ?? algForJwk(jwkKey);

      return jwksSchema.parse({
        ...jwkKey,
        alg,
        use: "sig",
        kid: signingKey.kid,
      });
    }),
  );
}

/**
 * JWKS for publication on a tenant's `/.well-known/jwks.json`. Honors the
 * configured `signingKeyMode` and, in `"tenant"` mode, returns the union of
 * the tenant's keys and the control-plane fallback so tokens signed by either
 * still verify during the per-tenant key rollout.
 */
export async function getJwksForPublication(
  data: DataAdapters,
  tenantId: string,
  modeOption: SigningKeyModeOption | undefined,
) {
  const signingKeys = await resolveSigningKeys(
    data.keys,
    tenantId,
    modeOption,
    { purpose: "publish" },
  );
  return signingKeysToJwks(signingKeys);
}

/**
 * JWKS for verifying bearer tokens. Mirrors the publication set so any kid
 * that appears in a tenant's published `/.well-known/jwks.json` will also
 * verify. Without a resolved tenant (control-plane host with no tenant
 * subdomain), only control-plane-signed tokens are accepted.
 */
export async function getJwksForVerification(
  data: DataAdapters,
  tenantId: string | undefined,
  modeOption: SigningKeyModeOption | undefined,
) {
  if (!tenantId) {
    const signingKeys = await listControlPlaneKeys(data.keys);
    return signingKeysToJwks(signingKeys);
  }
  return getJwksForPublication(data, tenantId, modeOption);
}
