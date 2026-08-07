import { SCIM_USER_SCHEMA_URN } from "./user-mapping";
import { scimListResponse, ScimListResponse } from "./responses";

/**
 * Static SCIM discovery documents (RFC 7643 §5–7). The capability set mirrors
 * what AuthHero actually implements and what Auth0 advertises: PATCH and
 * filtering yes; bulk, sort, etag, changePassword no.
 */

/**
 * Largest page the `/Users` endpoints return, advertised as
 * `filter.maxResults` in ServiceProviderConfig. The route clamps `count` to
 * this so the advertised ceiling and the served page size can't drift apart.
 */
export const SCIM_MAX_RESULTS = 200;

export function serviceProviderConfig(location: string) {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    documentationUri: "https://authhero.com/docs",
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: SCIM_MAX_RESULTS },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description:
          "Authentication scheme using the OAuth Bearer Token Standard",
        primary: true,
      },
    ],
    meta: { resourceType: "ServiceProviderConfig", location },
  };
}

export function resourceTypes(baseUrl: string): ScimListResponse<unknown> {
  const userType = {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
    id: "User",
    name: "User",
    endpoint: "/Users",
    description: "User Account",
    schema: SCIM_USER_SCHEMA_URN,
    meta: {
      resourceType: "ResourceType",
      location: `${baseUrl}/ResourceTypes/User`,
    },
  };
  return scimListResponse([userType], 1, 1, 1);
}

export function schemas(baseUrl: string): ScimListResponse<unknown> {
  const userSchema = {
    id: SCIM_USER_SCHEMA_URN,
    name: "User",
    description: "User Account",
    attributes: [
      {
        name: "userName",
        type: "string",
        multiValued: false,
        required: true,
        caseExact: false,
        mutability: "readWrite",
        returned: "default",
        uniqueness: "server",
      },
      {
        name: "name",
        type: "complex",
        multiValued: false,
        required: false,
        subAttributes: [
          { name: "givenName", type: "string", multiValued: false },
          { name: "familyName", type: "string", multiValued: false },
        ],
      },
      {
        name: "displayName",
        type: "string",
        multiValued: false,
        required: false,
      },
      {
        name: "emails",
        type: "complex",
        multiValued: true,
        required: false,
        subAttributes: [
          { name: "value", type: "string", multiValued: false },
          { name: "primary", type: "boolean", multiValued: false },
          { name: "type", type: "string", multiValued: false },
        ],
      },
      {
        name: "active",
        type: "boolean",
        multiValued: false,
        required: false,
      },
    ],
    meta: {
      resourceType: "Schema",
      location: `${baseUrl}/Schemas/${SCIM_USER_SCHEMA_URN}`,
    },
  };
  return scimListResponse([userSchema], 1, 1, 1);
}
