export const env = {
  conformanceBaseUrl:
    process.env.CONFORMANCE_BASE_URL ?? "https://localhost.emobix.co.uk:8443",
  authheroBaseUrl: process.env.AUTHHERO_BASE_URL ?? "http://localhost:3000",
  authheroIssuer:
    process.env.AUTHHERO_ISSUER ?? "http://host.docker.internal:3000/",
  username: process.env.CONFORMANCE_USERNAME ?? "admin",
  password: process.env.CONFORMANCE_PASSWORD ?? "password2",
  alias: process.env.CONFORMANCE_ALIAS ?? "my-local-test",
  allowWarning: parseBool(process.env.ALLOW_WARNING),
  skipSetup: parseBool(process.env.SKIP_SETUP),
} as const;

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return v !== "0" && v !== "false" && v !== "no";
}
