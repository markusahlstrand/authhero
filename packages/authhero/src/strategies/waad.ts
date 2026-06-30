import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import {
  microsoftEntraRedirect,
  microsoftEntraValidate,
  microsoftEntraValidateWithRaw,
  microsoftLogoDataUri,
} from "./microsoft-entra";

// Microsoft Azure AD / Entra ID (enterprise). Uses the Microsoft Identity
// Platform v2.0 endpoint with the tenant segment from `options.realms`
// (tenant GUID, `organizations`, etc.). Falls back to `organizations` so
// only work/school accounts are accepted when no tenant is specified.
export const displayName = "Microsoft Azure AD";

export const logoDataUri = microsoftLogoDataUri;

const DEFAULT_TENANT = "organizations";

export function getRedirect(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  loginHint?: string,
) {
  return microsoftEntraRedirect(ctx, connection, loginHint, DEFAULT_TENANT);
}

export function validateAuthorizationCodeAndGetUser(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  code_verifier?: string,
) {
  return microsoftEntraValidate(
    ctx,
    connection,
    code,
    code_verifier,
    DEFAULT_TENANT,
  );
}

// Exposes the full decoded ID token payload alongside the normalized user so
// the connection callback can persist the entire upstream claim set (upn,
// preferred_username, unique_name, oid, …) to profileData.
export function validateAuthorizationCodeAndGetUserWithRaw(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  connection: Connection,
  code: string,
  code_verifier?: string,
) {
  return microsoftEntraValidateWithRaw(
    ctx,
    connection,
    code,
    code_verifier,
    DEFAULT_TENANT,
  );
}
