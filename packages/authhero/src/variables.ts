import { Bindings } from "./types";

export function getIssuer(env: Bindings) {
  return env.ISSUER;
}

export function getUniversalLoginUrl(env: Bindings) {
  return env.UNIVERSAL_LOGIN_URL || `${env.ISSUER}u/`;
}

export function getAuthUrl(env: Bindings) {
  return env.OAUTH_API_URL || env.ISSUER;
}

export function getCssUrl(env: Bindings) {
  return env.CSS_URL || `${getUniversalLoginUrl(env)}css/tailwind.css`;
}
