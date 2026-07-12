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

export const CONFIG_PLAN_NAME = "oidcc-config-certification-test-plan";

export const FORM_POST_BASIC_PLAN_NAME =
  "oidcc-formpost-basic-certification-test-plan";

// Same shape as the basic plan — the form-post profile is encoded in the
// plan name itself, not a variant. server_metadata + client_registration
// stay aligned with the rest of the runner's configs.
export const FORM_POST_BASIC_PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export const IMPLICIT_PLAN_NAME = "oidcc-implicit-certification-test-plan";

// The implicit plan pins `response_type` per-module internally (each module
// runs against a fixed response_type — `id_token` or `id_token token` — set
// at module-registration time inside the suite). Passing `response_type` as
// a plan-level variant trips the suite's "Variant 'X' has been set by user,
// but test plan already sets this variant for module ..." 500. Same gotcha
// the config plan documents above. So: server_metadata + client_registration
// only, and let the plan choose the response_type.
export const IMPLICIT_PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export const FORM_POST_IMPLICIT_PLAN_NAME =
  "oidcc-formpost-implicit-certification-test-plan";

// Same module-level pinning as the implicit plan — `response_type` is fixed
// per-module by the suite, and `response_mode=form_post` is encoded in the
// plan name itself. So variants stay limited to server_metadata +
// client_registration.
export const FORM_POST_IMPLICIT_PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export const HYBRID_PLAN_NAME = "oidcc-hybrid-certification-test-plan";

// Like the implicit plan, the hybrid plan pins `response_type` per-module
// (`code id_token`, `code token`, `code id_token token`) inside the suite.
// Passing response_type as a plan-level variant trips the suite's
// "Variant already set by test plan for module ..." error. So variants stay
// limited to server_metadata + client_registration.
export const HYBRID_PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export const FORM_POST_HYBRID_PLAN_NAME =
  "oidcc-formpost-hybrid-certification-test-plan";

// Same module-level pinning as the hybrid plan — `response_type` is fixed
// per-module by the suite (`code id_token`, `code token`, `code id_token
// token`), and `response_mode=form_post` is encoded in the plan name itself.
// So variants stay limited to server_metadata + client_registration.
export const FORM_POST_HYBRID_PLAN_VARIANT = {
  server_metadata: "discovery",
  client_registration: "static_client",
} as const;

export const DYNAMIC_PLAN_NAME = "oidcc-dynamic-certification-test-plan";

// Dynamic registration variant — the suite calls /oidc/register itself for
// each module instead of using the seeded clients. The conformance tenant
// has `enable_dynamic_client_registration: true` set by create-authhero
// when --conformance is passed.
//
// `response_type` must be supplied at the plan level: the suite's
// OIDCCDynamicTestPlan deliberately leaves ResponseType unpinned ("will be
// offered in the menu") so the API caller has to pick one. Without it the
// suite rejects the plan with "TestModule 'oidcc-idtoken-rs256' requires a
// value for variant 'response_type'". `server_metadata` and
// `client_registration` are pinned by the modules themselves and must NOT
// be passed here, or the suite rejects the plan with "Variant 'X' has been
// set by user, but test plan already sets this variant for module ...".
export const DYNAMIC_PLAN_VARIANT = {
  response_type: "code",
} as const;

// The config plan's only module (oidcc-discovery-endpoint-verification)
// already pins server_metadata=discovery + client_registration=static_client
// at the module level, so passing them again as plan-level variants makes
// the suite reject the plan with "Variant 'X' has been set by user, but
// test plan already sets this variant for module ...". Hence: no variants.

function buildSharedClientConfig(label: string) {
  const issuer = env.authheroIssuer.endsWith("/")
    ? env.authheroIssuer
    : `${env.authheroIssuer}/`;
  return {
    alias: env.workerAlias,
    description: `AuthHero local ${label} — ${env.workerAlias}`,
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

export function buildConfigPlanConfig() {
  return buildSharedClientConfig("OIDC Config");
}

export function buildFormPostBasicPlanConfig() {
  return buildSharedClientConfig("OIDC Form Post Basic");
}

export function buildImplicitPlanConfig() {
  return buildSharedClientConfig("OIDC Implicit");
}

export function buildFormPostImplicitPlanConfig() {
  return buildSharedClientConfig("OIDC Form Post Implicit");
}

export function buildHybridPlanConfig() {
  return buildSharedClientConfig("OIDC Hybrid");
}

export function buildFormPostHybridPlanConfig() {
  return buildSharedClientConfig("OIDC Form Post Hybrid");
}

export function buildDynamicPlanConfig() {
  // The dynamic plan has the suite register its own clients via DCR, so the
  // hardcoded client_id/client_secret slots aren't actually consulted by the
  // modules. Reusing the shared config keeps alias/discoveryUrl/consent/browser
  // aligned with every other plan and is harmless — the suite ignores client
  // creds for dynamic_client variants.
  return buildSharedClientConfig("OIDC Dynamic");
}
