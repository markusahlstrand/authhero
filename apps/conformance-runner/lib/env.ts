// Default to HTTPS — the stricter conformance plans (e.g. RP-initiated logout)
// reject every endpoint in the discovery document that isn't `https://`.
const httpsEnabled = parseBoolWithDefault(process.env.HTTPS_ENABLED, true);
const scheme = httpsEnabled ? "https" : "http";

export const env = {
  conformanceBaseUrl:
    process.env.CONFORMANCE_BASE_URL ?? "https://localhost.emobix.co.uk:8443",
  authheroBaseUrl:
    process.env.AUTHHERO_BASE_URL ?? `${scheme}://localhost:3000`,
  authheroIssuer:
    process.env.AUTHHERO_ISSUER ?? `${scheme}://host.docker.internal:3000/`,
  username: process.env.CONFORMANCE_USERNAME ?? "admin",
  password: process.env.CONFORMANCE_PASSWORD ?? "password2",
  alias: process.env.CONFORMANCE_ALIAS ?? "my-local-test",
  allowWarning: parseBool(process.env.ALLOW_WARNING),
  skipSetup: parseBool(process.env.SKIP_SETUP),
  httpsEnabled,
} as const;

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}

function parseBoolWithDefault(
  value: string | undefined,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  const v = value.toLowerCase();
  return v !== "0" && v !== "false" && v !== "no" && v !== "";
}
