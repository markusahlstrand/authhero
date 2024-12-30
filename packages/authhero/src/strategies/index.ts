import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import * as apple from "./apple";
import * as facebook from "./facebook";
import * as google from "./google-oauth2";
import { Bindings, Variables } from "../types";

export type UserInfo = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
};

export type Strategy = {
  getRedirect: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
  ) => Promise<{ redirectUrl: string; code: string; codeVerifier?: string }>;
  validateAuthorizationCodeAndGetUser: (
    ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
    connection: Connection,
    code: string,
    codeVerifier?: string,
  ) => Promise<UserInfo>;
};

export function getStrategy(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  name: string,
): Strategy {
  const envStragegies = ctx.env.STRATEGIES || {};

  const strategies = {
    apple,
    facebook,
    "google-oauth2": google,
    ...envStragegies,
  };

  const strategy = strategies[name];
  if (!strategy) {
    throw new Error(`Strategy ${name} not found`);
  }

  return strategy;
}
