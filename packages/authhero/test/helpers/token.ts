import { signJWT } from "../../src/utils/jwt";
import { createX509Certificate } from "../../src/utils/encryption";
import { SigningKey } from "@authhero/adapter-interfaces";
import { MANAGEMENT_API_AUDIENCE } from "../../src/middlewares/authentication";

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
  user_id?: string;
  tenant_id?: string;
  scope?: string;
  permissions?: string[];
  aud?: string;
  // OIDC Core 5.5 — list of claim names the original /authorize request
  // asked for under `claims.userinfo`. Tests use this to exercise the
  // `requested_userinfo_claims` access-token slot end-to-end.
  requested_userinfo_claims?: string[];
}

export async function createToken(params?: CreateTokenParams) {
  const certificate = await getCertificate();

  return signJWT(
    "RS256",
    pemToBuffer(certificate.pkcs7!),
    {
      aud: params?.aud ?? MANAGEMENT_API_AUDIENCE,
      scope: params?.scope ?? "openid email profile",
      permissions: params?.permissions || [],
      sub: params?.user_id || "userId",
      iss: "http://localhost:3000/",
      tenant_id: params?.tenant_id,
      ...(params?.requested_userinfo_claims
        ? { requested_userinfo_claims: params.requested_userinfo_claims }
        : {}),
    },
    {
      includeIssuedTimestamp: true,
      expiresInSeconds: 3600,
      headers: {
        kid: certificate.kid,
      },
    },
  );
}

const ADMIN_PERMISSIONS = [
  "create:actions",
  "create:client_grants",
  "create:client_registration_tokens",
  "create:clients",
  "create:connections",
  "create:custom_domains",
  "create:email_provider",
  "create:email_templates",
  "create:flows",
  "create:forms",
  "create:guardian_enrollment_tickets",
  "create:hooks",
  "create:log_streams",
  "create:migration_sources",
  "create:organization_connections",
  "create:organizations",
  "create:resource_servers",
  "create:roles",
  "create:signing_keys",
  "create:user_tickets",
  "create:users",
  "delete:actions",
  "delete:branding",
  "delete:client_grants",
  "delete:clients",
  "delete:connections",
  "delete:custom_domains",
  "delete:email_provider",
  "delete:flows",
  "delete:forms",
  "delete:hooks",
  "delete:log_streams",
  "delete:migration_sources",
  "delete:organization_connections",
  "delete:organizations",
  "delete:prompts",
  "delete:refresh_tokens",
  "delete:resource_servers",
  "delete:roles",
  "delete:sessions",
  "delete:users",
  "read:actions",
  "read:attack_protection",
  "read:branding",
  "read:client_grants",
  "read:clients",
  "read:connections",
  "read:custom_domains",
  "read:email_provider",
  "read:email_templates",
  "read:flows",
  "read:forms",
  "read:guardian_factors",
  "read:hooks",
  "read:log_streams",
  "read:logs",
  "read:migration_sources",
  "read:organization_connections",
  "read:organizations",
  "read:prompts",
  "read:refresh_tokens",
  "read:resource_servers",
  "read:roles",
  "read:sessions",
  "read:signing_keys",
  "read:stats",
  "read:tenant_operations",
  "create:tenant_operations",
  "read:tenants",
  "read:users",
  "update:actions",
  "update:attack_protection",
  "update:branding",
  "update:client_grants",
  "update:clients",
  "update:connections",
  "update:custom_domains",
  "update:email_provider",
  "update:email_templates",
  "update:flows",
  "update:forms",
  "update:guardian_factors",
  "update:hooks",
  "update:log_streams",
  "update:logs",
  "update:migration_sources",
  "update:organization_connections",
  "update:organizations",
  "update:prompts",
  "update:resource_servers",
  "update:roles",
  "update:sessions",
  "update:signing_keys",
  "update:tenants",
  "update:users",
];

export async function getAdminToken() {
  return createToken({
    permissions: ADMIN_PERMISSIONS,
    aud: MANAGEMENT_API_AUDIENCE,
  });
}
