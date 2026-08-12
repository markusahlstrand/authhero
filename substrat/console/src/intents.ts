// The console ⇄ platform intent contract. As of Substrat 0.35 (#412) the kinds
// and payload schemas are CANONICAL IN CONTRACTS — the platform's handlers
// (`provisionTenantHandler` / `setEntitlementsHandler` in control-plane-api)
// parse exactly these. This file re-exports them so module code keeps one
// import site; the shapes are the ones this repo proposed in
// docs/provisioning-capability.md §8.1, adopted upstream verbatim.
export {
  PROVISION_TENANT_KIND,
  provisionTenantPayload,
  SET_ENTITLEMENTS_KIND,
  setEntitlementsPayload,
  type ProvisionTenantPayload,
  type SetEntitlementsPayload,
} from "@substrat-run/contracts";
