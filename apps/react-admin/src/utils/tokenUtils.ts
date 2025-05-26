import auth0DataProvider from "src/auth0DataProvider";
import { DomainConfig } from "./domainUtils";

async function fetchTokenWithClientCredentials(
  domain: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const response = await fetch(`https://proxy.authhe.ro/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Auth0-Domain": domain,
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${domain}/api/v2/`,
      scope:
        "read:users update:users create:users delete:users read:user_idp_tokens " +
        "read:clients update:clients create:clients delete:clients " +
        "read:connections update:connections create:connections delete:connections " +
        "read:resource_servers update:resource_servers create:resource_servers delete:resource_servers " +
        "read:rules update:rules create:rules delete:rules " +
        "read:email_templates update:email_templates " +
        "read:tenant_settings update:tenant_settings " +
        "read:logs read:stats read:branding update:branding read:forms",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch token with client credentials");
  }

  const data = await response.json();
  return data.access_token;
}

export default async function getToken(
  domainConfig: DomainConfig,
): Promise<string> {
  // Check if the domain config has a token
  if (domainConfig.connectionMethod === "token" && domainConfig.token) {
    return domainConfig.token;
  } else if (
    domainConfig.connectionMethod === "client_credentials" &&
    domainConfig.clientId &&
    domainConfig.clientSecret
  ) {
    // If using client credentials, generate a token
    const token = await fetchTokenWithClientCredentials(
      domainConfig.url,
      domainConfig.clientId,
      domainConfig.clientSecret,
    );
    return token;
  }

  // If no token is available, throw an error
  throw new Error(
    "No authentication method available. Configure either a token or client credentials.",
  );
}
