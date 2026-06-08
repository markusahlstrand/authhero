export const Strategy = {
  EMAIL: "email",
  SMS: "sms",
  USERNAME_PASSWORD: "Username-Password-Authentication",
  GOOGLE_OAUTH2: "google-oauth2",
  APPLE: "apple",
  FACEBOOK: "facebook",
  GITHUB: "github",
  WINDOWSLIVE: "windowslive",
  VIPPS: "vipps",
  OIDC: "oidc",
  OAUTH2: "oauth2",
  SAMLP: "samlp",
  WAAD: "waad",
  ADFS: "adfs",
  OKTA: "okta",
} as const;

export const StrategyType = {
  DATABASE: "database",
  SOCIAL: "social",
  PASSWORDLESS: "passwordless",
} as const;
