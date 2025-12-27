import { UpdateParams, withLifecycleCallbacks } from "react-admin";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
} from "./authProvider";
import auth0DataProvider from "./auth0DataProvider";
import {
  getDomainFromStorage,
  buildUrlWithProtocol,
  formatDomain,
} from "./utils/domainUtils";

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
    const domains = getDomainFromStorage();
    const formattedAuth0Domain = formatDomain(auth0Domain);
    const domainConfig = domains.find((d) => formatDomain(d.url) === formattedAuth0Domain);

    if (domainConfig?.restApiUrl) {
      // Use the custom REST API URL if configured
      baseUrl = domainConfig.restApiUrl;
    } else {
      // Otherwise use the auth domain with HTTPS
      baseUrl = buildUrlWithProtocol(auth0Domain);
    }
  }

  // TODO - duplicate auth0DataProvider to tenantsDataProvider
  // we are introducing non-auth0 endpoints AND we don't require the tenants-id header
  const provider = auth0DataProvider(
    baseUrl,
    authorizedHttpClient,
    undefined,
    auth0Domain,
  );

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
  // Start with a default API URL
  let apiUrl;

  if (auth0Domain) {
    // Check if there's a custom REST API URL configured for this domain
    const domains = getDomainFromStorage();
    const formattedAuth0Domain = formatDomain(auth0Domain);
    const domainConfig = domains.find((d) => formatDomain(d.url) === formattedAuth0Domain);

    if (domainConfig?.restApiUrl) {
      // Use the custom REST API URL if configured
      apiUrl = domainConfig.restApiUrl;
    } else {
      // Otherwise construct an API URL using the auth0Domain with HTTPS
      apiUrl = buildUrlWithProtocol(auth0Domain);
    }
  } else {
    // Fallback to the environment variable
    apiUrl = import.meta.env.VITE_AUTH0_API_URL;
  }

  // Ensure apiUrl doesn't end with a slash
  apiUrl = apiUrl.replace(/\/$/, "");

  // Create an organization-scoped HTTP client for this tenant
  // This ensures the user has the correct permissions for accessing tenant resources
  const organizationHttpClient = createOrganizationHttpClient(tenantId);

  // Create the auth0Provider with the API URL, tenant ID, domain, and org-scoped client
  const auth0Provider = auth0DataProvider(
    apiUrl,
    organizationHttpClient,
    tenantId,
    auth0Domain,
  );

  return auth0Provider;
}
