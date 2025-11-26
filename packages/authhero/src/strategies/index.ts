import { Context } from "hono";
import { Connection } from "@authhero/adapter-interfaces";
import type { FC } from "hono/jsx";
import * as apple from "./apple";
import * as facebook from "./facebook";
import * as google from "./google-oauth2";
import * as vipps from "./vipps";
import * as github from "./github";
import * as microsoft from "./microsoft";
import { Bindings, Variables } from "../types";

export type UserInfo = {
  sub: string;
  email?: string;
  given_name?: string;
  family_name?: string;
  name?: string;
};

export type Strategy = {
  displayName: string;
  logo: FC<{ className?: string }>;
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
  disableEmbeddedBrowsers?: boolean;
};

export function getStrategy(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  name: string,
): Strategy {
  const envStrategies = ctx.env.STRATEGIES || {};

  const strategies: Record<string, Strategy> = {
    apple,
    facebook,
    "google-oauth2": google,
    vipps,
    github,
    microsoft,
    ...envStrategies,
  };

  const strategy = strategies[name];
  if (!strategy) {
    throw new Error(`Strategy ${name} not found`);
  }

  return strategy;
}

// Helper to get social strategy by name
export function getSocialStrategy(name: string): Strategy | undefined {
  const strategies: Record<string, Strategy> = {
    apple,
    facebook,
    "google-oauth2": google,
    vipps,
    github,
    microsoft,
  };

  return strategies[name];
}
