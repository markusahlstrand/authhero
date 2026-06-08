import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import { Bindings, Variables } from "../types";
import {
  microsoftEntraRedirect,
  microsoftEntraValidate,
  microsoftLogoDataUri,
} from "./microsoft-entra";

// Microsoft Account (consumer accounts: outlook.com, hotmail.com, live.com, xbox).
// Auth0-compatible strategy name; uses the Microsoft Identity Platform v2.0
// endpoint with the `consumers` tenant segment.
export const displayName = "Microsoft Account";

export const logoDataUri = microsoftLogoDataUri;

const DEFAULT_TENANT = "consumers";

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
