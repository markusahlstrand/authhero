import { User } from "@authhero/adapter-interfaces";
import { ScimFilterValue } from "./filter";

export const SCIM_USER_SCHEMA_URN =
  "urn:ietf:params:scim:schemas:core:2.0:User";

export interface ScimEmail {
  value: string;
  primary?: boolean;
  type?: string;
}

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName?: string;
  name?: { givenName?: string; familyName?: string };
  displayName?: string;
  emails?: ScimEmail[];
  active: boolean;
  meta: {
    resourceType: "User";
    created?: string;
    lastModified?: string;
    location: string;
  };
}

/**
 * The subset of user fields SCIM writes. `blocked` carries the inverse of the
 * SCIM `active` attribute (active:false → blocked:true); `externalId` is
 * persisted out-of-band in the scim_external_ids table by the route, not on
 * the user row.
 */
export interface MappedUserFields {
  email?: string;
  username?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
  blocked?: boolean;
  externalId?: string;
}

function primaryEmail(emails: ScimEmail[] | undefined): string | undefined {
  if (!emails || emails.length === 0) return undefined;
  const chosen = emails.find((e) => e.primary) ?? emails[0];
  return chosen?.value;
}

/**
 * Project an AuthHero user to a SCIM User resource. Mirrors Auth0's default
 * mapping: SCIM `id` is the AuthHero `user_id`, `active` is the inverse of
 * `blocked`, and `externalId` comes from the connection's external-id table.
 */
export function userToScimResource(
  user: User,
  externalId: string | undefined,
  location: string,
): ScimUserResource {
  const emails: ScimEmail[] | undefined = user.email
    ? [{ value: user.email, primary: true, type: "work" }]
    : undefined;

  const name =
    user.given_name || user.family_name
      ? { givenName: user.given_name, familyName: user.family_name }
      : undefined;

  return {
    schemas: [SCIM_USER_SCHEMA_URN],
    id: user.user_id,
    externalId,
    userName: user.email ?? user.username,
    name,
    displayName: user.name,
    emails,
    active: !user.blocked,
    meta: {
      resourceType: "User",
      created: user.created_at,
      lastModified: user.updated_at,
      location,
    },
  };
}

/**
 * Map a SCIM User resource (as sent on create/replace, or the result of
 * applying a PATCH) to AuthHero user fields. `userName` becomes `email` when it
 * looks like an address, otherwise `username`. `active` maps to the inverse of
 * `blocked` (omitted when `active` is absent, so a partial update doesn't
 * unblock).
 */
export function scimResourceToUserFields(resource: {
  userName?: string;
  externalId?: string;
  name?: { givenName?: string; familyName?: string };
  displayName?: string;
  emails?: ScimEmail[];
  active?: boolean;
}): MappedUserFields {
  const userName = resource.userName;
  const isEmailUserName = !!userName && userName.includes("@");
  const email = primaryEmail(resource.emails) ?? (isEmailUserName ? userName : undefined);

  return {
    email,
    username: userName && !isEmailUserName ? userName : undefined,
    given_name: resource.name?.givenName,
    family_name: resource.name?.familyName,
    name: resource.displayName,
    blocked: resource.active === undefined ? undefined : !resource.active,
    externalId: resource.externalId,
  };
}

/**
 * Flatten a user (+ its externalId) to the attribute map the filter evaluator
 * expects. Keys mirror the SCIM attribute names real IdPs filter on.
 */
export function userToFilterAttributes(
  user: User,
  externalId: string | undefined,
): Record<string, ScimFilterValue | undefined> {
  return {
    userName: user.email ?? user.username,
    externalId,
    active: !user.blocked,
    email: user.email,
    "emails.value": user.email,
  };
}
