import { ScimMappingEntry } from "@authhero/adapter-interfaces";

/**
 * Default SCIM ↔ AuthHero attribute mapping, mirroring Auth0's default
 * inbound-provisioning mapping. `scim` is the SCIM resource attribute path,
 * `auth0` the AuthHero user field. The `active` → `blocked` entry maps SCIM
 * account status onto AuthHero's block flag; the inversion (active=false ⇒
 * blocked=true) is applied by the provisioning layer in Phase 2, not here.
 */
export const DEFAULT_SCIM_MAPPING: ScimMappingEntry[] = [
  { scim: "userName", auth0: "email" },
  { scim: "emails[primary eq true].value", auth0: "email" },
  { scim: "name.givenName", auth0: "given_name" },
  { scim: "name.familyName", auth0: "family_name" },
  { scim: "displayName", auth0: "name" },
  { scim: "active", auth0: "blocked" },
];

export const DEFAULT_USER_ID_ATTRIBUTE = "externalId";
