import { env } from "./env";

export const PLAN_NAME = "oidcc-basic-certification-test-plan";

export const PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export function buildPlanConfig() {
  const issuer = env.authheroIssuer.endsWith("/")
    ? env.authheroIssuer
    : `${env.authheroIssuer}/`;
  return {
    alias: env.alias,
    description: `AuthHero local OIDC Basic — ${env.alias}`,
    server: {
      discoveryUrl: `${issuer}.well-known/openid-configuration`,
    },
    client: {
      client_id: "test-client-id",
      client_secret: "test-client-secret",
    },
    client2: {
      client_id: "test-client-id-2",
      client_secret: "test-client-secret-2",
    },
    // oidcc-server-client-secret-post copies this slot into `client` at
    // configureClient() time (see OIDCCServerTestClientSecretPost.java). The
    // suite assumes servers restrict each client to one auth method, so it
    // wants a separate client config per auth type — we use client-2.
    client_secret_post: {
      client_id: "test-client-id-2",
      client_secret: "test-client-secret-2",
    },
    consent: {},
    browser: [],
  };
}
