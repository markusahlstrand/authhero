import { createJWT } from "oslo/jwt";
import { TimeSpan } from "oslo";
import { createX509Certificate } from "../../src/helpers/encryption";
import { SigningKey } from "@authhero/adapter-interfaces";

let signingKey: SigningKey | null = null;

export function pemToBuffer(pem: string): ArrayBuffer {
  const base64String = pem
    .replace(/^-----BEGIN RSA PRIVATE KEY-----/, "")
    .replace(/-----END RSA PRIVATE KEY-----/, "")
    .replace(/^-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/^-----BEGIN PUBLIC KEY-----/, "")
    .replace(/-----END PUBLIC KEY-----/, "")
    .replace(/\s/g, "");

  return Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0)).buffer;
}

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

  return createJWT(
    "RS256",
    pemToBuffer(certificate.pkcs7!),
    {
      aud: "example.com",
      scope: params?.scope ?? "openid email profile",
      permissions: params?.permissions || [],
      sub: params?.userId || "userId",
      iss: "test.example.com",
      tenant_id: params?.tenantId,
    },
    {
      includeIssuedTimestamp: true,
      expiresIn: new TimeSpan(1, "h"),
      headers: {
        kid: certificate.kid,
      },
    },
  );
}

export async function getAdminToken() {
  return createToken({
    permissions: ["auth:read", "auth:write"],
  });
}
