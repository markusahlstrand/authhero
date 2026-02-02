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

  console.log("[getDataprovider] auth0Domain:", auth0Domain, "VITE_SIMPLE_REST_URL:", import.meta.env.VITE_SIMPLE_REST_URL);

  if (auth0Domain) {
    // Check if there's a custom REST API URL configured for this domain
    const domains = getDomainFromStorage();
    const formattedAuth0Domain = formatDomain(auth0Domain);
    const domainConfig = domains.find(
      (d) => formatDomain(d.url) === formattedAuth0Domain,
    );

    console.log("[getDataprovider] domains:", domains, "domainConfig:", domainConfig);

    if (domainConfig?.restApiUrl) {
      // Use the custom REST API URL if configured (ensure HTTPS)
      baseUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
    } else {
      // Otherwise use the auth domain with HTTPS
      baseUrl = buildUrlWithProtocol(auth0Domain);
    }
  } else if (baseUrl) {
    // Ensure env variable URL also uses HTTPS
    baseUrl = buildUrlWithProtocol(baseUrl);
  }

  console.log("[getDataprovider] final baseUrl:", baseUrl);

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

  console.log("[getDataproviderForTenant] tenantId:", tenantId, "auth0Domain:", auth0Domain);

  if (auth0Domain) {
    // Check if there's a custom REST API URL configured for this domain
    const domains = getDomainFromStorage();
    const formattedAuth0Domain = formatDomain(auth0Domain);
    const domainConfig = domains.find(
      (d) => formatDomain(d.url) === formattedAuth0Domain,
    );

    console.log("[getDataproviderForTenant] domains:", domains, "domainConfig:", domainConfig);

    if (domainConfig?.restApiUrl) {
      // Use the custom REST API URL if configured (ensure HTTPS)
      apiUrl = buildUrlWithProtocol(domainConfig.restApiUrl);
    } else {
      // Otherwise construct an API URL using the auth0Domain with HTTPS
      apiUrl = buildUrlWithProtocol(auth0Domain);
    }
  } else {
    // Fallback to the environment variable (ensure HTTPS)
    apiUrl = buildUrlWithProtocol(import.meta.env.VITE_AUTH0_API_URL || "");
  }

  // Ensure apiUrl doesn't end with a slash
  apiUrl = apiUrl.replace(/\/$/, "");

  console.log("[getDataproviderForTenant] final apiUrl:", apiUrl);

  // Create a dynamic httpClient that checks single-tenant mode at REQUEST TIME
  // This is important because the mode may not be known when the dataProvider is created
  const dynamicHttpClient = (url: string, options?: any) => {
    // Check single-tenant mode at request time, not at creation time
    const storedFlag = sessionStorage.getItem("isSingleTenant");
    const isSingleTenant =
      storedFlag?.endsWith("|true") || storedFlag === "true";

    // In single-tenant mode, use the regular authorized client without organization scope
    // In multi-tenant mode, use organization-scoped client for proper access control
    if (isSingleTenant) {
      return authorizedHttpClient(url, options);
    } else {
      return createOrganizationHttpClient(tenantId)(url, options);
    }
  };

  // Create the auth0Provider with the API URL, tenant ID, domain, and dynamic client
  const auth0Provider = auth0DataProvider(
    apiUrl,
    dynamicHttpClient,
    tenantId,
    auth0Domain,
  );

  return auth0Provider;
}
