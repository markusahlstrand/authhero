import { env } from "./env";

export const PLAN_NAME = "oidcc-basic-certification-test-plan";

export const PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export const LOGOUT_PLAN_NAME =
  "oidcc-rp-initiated-logout-certification-test-plan";

export const LOGOUT_PLAN_VARIANT = {
  client_registration: "static_client",
  response_type: "code",
} as const;

function buildSharedClientConfig(label: string) {
  const issuer = env.authheroIssuer.endsWith("/")
    ? env.authheroIssuer
    : `${env.authheroIssuer}/`;
  return {
    alias: env.alias,
    description: `AuthHero local ${label} — ${env.alias}`,
    server: {
      discoveryUrl: `${issuer}.well-known/openid-configuration`,
    },
    // Secrets MUST be ≥32 bytes — the conformance suite derives an HS256 key
    // from client_secret for some negative tests (e.g. bad-id-token-hint
    // signature handling) and refuses to run when the secret is shorter.
    client: {
      client_id: "test-client-id",
      client_secret: "test-client-secret-at-least-32-bytes-long",
    },
    client2: {
      client_id: "test-client-id-2",
      client_secret: "test-client-secret-2-at-least-32-bytes-long",
    },
    // oidcc-server-client-secret-post copies this slot into `client` at
    // configureClient() time (see OIDCCServerTestClientSecretPost.java). The
    // suite assumes servers restrict each client to one auth method, so it
    // wants a separate client config per auth type — we use client-2.
    client_secret_post: {
      client_id: "test-client-id-2",
      client_secret: "test-client-secret-2-at-least-32-bytes-long",
    },
    consent: {},
    browser: [],
  };
}

export function buildPlanConfig() {
  return buildSharedClientConfig("OIDC Basic");
}

export function buildLogoutPlanConfig() {
  return buildSharedClientConfig("OIDC RP-Initiated Logout");
}
