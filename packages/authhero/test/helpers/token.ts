import { SignJWT, importPKCS8 } from "jose";
import { createX509Certificate } from "../../src/utils/encryption";
import { SigningKey } from "@authhero/adapter-interfaces";

let signingKey: SigningKey | null = null;

export async function getCertificate() {
  if (!signingKey) {
    signingKey = await createX509Certificate({
      name: "CN=sesamy",
    });
  }

  return signingKey;
}

export interface CreateTokenParams {
  userId?: string;
  tenantId?: string;
  scope?: string;
  permissions?: string[];
}

export async function createToken(params?: CreateTokenParams) {
  const certificate = await getCertificate();
  const privateKey = await importPKCS8(certificate.pkcs7!, "RS256");

  return new SignJWT({
    aud: "example.com",
    scope: params?.scope ?? "openid email profile",
    permissions: params?.permissions || [],
    sub: params?.userId || "userId",
    iss: "test.example.com",
    tenant_id: params?.tenantId,
  })
    .setProtectedHeader({ alg: "RS256", kid: certificate.kid })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

export async function getAdminToken() {
  return createToken({
    permissions: ["auth:read", "auth:write"],
  });
}
