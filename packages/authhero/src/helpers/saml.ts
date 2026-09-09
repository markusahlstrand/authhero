// Re-export SAML functionality from the edge-safe core entry. The full
// `@authhero/saml` entry inlines the same core plus LocalSamlSigner; importing
// both entries bundled the core twice into authhero.
export * from "@authhero/saml/core";
