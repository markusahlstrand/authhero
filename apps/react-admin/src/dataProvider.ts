import { UpdateParams, withLifecycleCallbacks } from "react-admin";
import { authorizedHttpClient } from "./authProvider";
import auth0DataProvider from "./auth0DataProvider";
import { getDomainFromCookies } from "./utils/domainUtils";

async function removeExtraFields(params: UpdateParams) {
  delete params.data?.id;
  delete params.data?.tenant_id;
  delete params.data?.updated_at;
  delete params.data?.created_at;

  // Remove empty properties
  Object.keys(params.data).forEach((key) => {
    if (params.data[key] === undefined) {
      delete params.data[key];
    }
  });

  return params;
}

export function getDataprovider(auth0Domain?: string) {
  // Create the complete base URL using the selected domain
  let baseUrl = import.meta.env.VITE_SIMPLE_REST_URL;

  if (auth0Domain) {
    // Check if there's a custom REST API URL configured for this domain
    const domains = getDomainFromCookies();
    const domainConfig = domains.find((d) => d.url === auth0Domain);

    if (domainConfig?.restApiUrl) {
      // Use the custom REST API URL if configured
      baseUrl = domainConfig.restApiUrl;
    } else {
      // Otherwise use the auth domain with https
      // Check if the domain includes the protocol (http/https)
      if (!auth0Domain.startsWith("http")) {
        // If not, assume https
        baseUrl = `https://${auth0Domain}`;
      } else {
        // If it already has http/https, use it as is
        baseUrl = auth0Domain;
      }
    }
  }

  // TODO - duplicate auth0DataProvider to tenantsDataProvider
  // we are introducing non-auth0 endpoints AND we don't require the tenants-id header
  const provider = auth0DataProvider(baseUrl, authorizedHttpClient);

  return withLifecycleCallbacks(provider, [
    {
      resource: "tenants",
      beforeUpdate: removeExtraFields,
    },
  ]);
}

export function getDataproviderForTenant(
  tenantId: string,
  auth0Domain?: string,
) {
  console.log(
    "getDataproviderForTenant called with tenantId:",
    tenantId,
    "auth0Domain:",
    auth0Domain,
  );

  // Start with a default API URL
  let apiUrl;

  if (auth0Domain) {
    // Check if there's a custom REST API URL configured for this domain
    const domains = getDomainFromCookies();
    console.log("Domains from cookies:", domains);

    const domainConfig = domains.find((d) => d.url === auth0Domain);
    console.log("Found domain config:", domainConfig);

    if (domainConfig?.restApiUrl) {
      // Use the custom REST API URL if configured
      console.log("Using restApiUrl from cookie:", domainConfig.restApiUrl);
      apiUrl = domainConfig.restApiUrl;
    } else {
      // Otherwise construct an API URL using the auth0Domain
      // Make sure to use https:// protocol for API requests
      if (!auth0Domain.startsWith("http")) {
        apiUrl = `https://${auth0Domain}`;
      } else {
        apiUrl = auth0Domain;
      }
      console.log("Using constructed apiUrl:", apiUrl);
    }
  } else {
    // Fallback to the environment variable or a hard-coded default
    apiUrl = import.meta.env.VITE_AUTH0_API_URL || "https://auth2.sesamy.dev";
    console.log("Using fallback apiUrl:", apiUrl);
  }

  // Ensure apiUrl doesn't end with a slash
  apiUrl = apiUrl.replace(/\/$/, "");

  // Create the auth0Provider with the API URL and tenant ID
  console.log("Creating auth0DataProvider with final apiUrl:", apiUrl);
  const auth0Provider = auth0DataProvider(
    apiUrl,
    authorizedHttpClient,
    tenantId,
  );

  return auth0Provider;
}
