import { Bindings } from "./types";

export function getIssuer(env: Bindings, customDomain?: string) {
  if (customDomain) {
    return `https://${customDomain}/`;
  }
  return env.ISSUER;
}

export function getUniversalLoginUrl(env: Bindings, customDomain?: string) {
  if (customDomain) {
    return `https://${customDomain}/u/`;
  }
  return env.UNIVERSAL_LOGIN_URL || `${env.ISSUER}u/`;
}

export function getAuthUrl(env: Bindings, customDomain?: string) {
  if (customDomain) {
    return `https://${customDomain}/`;
  }
  return env.OAUTH_API_URL || env.ISSUER;
}
