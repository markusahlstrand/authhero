import { UpdateParams, withLifecycleCallbacks } from "react-admin";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
} from "./authProvider";
import auth0DataProvider from "./auth0DataProvider";
import { getConfigValue } from "./utils/runtimeConfig";
import {
  getDomainFromStorage,
  buildUrlWithProtocol,
  formatDomain,
} from "./utils/domainUtils";

/**
 * Resolves the API base URL for a given domain, checking for custom restApiUrl
 * in stored domain config and falling back to the domain itself with HTTPS.
 */
export function resolveApiBase(auth0Domain?: string): string {
  if (auth0Domain) {
    const domains = getDomainFromStorage();
    const formattedAuth0Domain = formatDomain(auth0Domain);
    const domainConfig = domains.find(
      (d) => formatDomain(d.url) === formattedAuth0Domain,
    );

    if (domainConfig?.restApiUrl) {
      return buildUrlWithProtocol(domainConfig.restApiUrl);
    }
    return buildUrlWithProtocol(auth0Domain);
  }

  const envUrl = getConfigValue("apiUrl");
  if (envUrl) {
    return buildUrlWithProtocol(envUrl);
  }

  return "";
}

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
  const baseUrl = resolveApiBase(auth0Domain);

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
  let apiUrl = resolveApiBase(auth0Domain);

  // Ensure apiUrl doesn't end with a slash
  apiUrl = apiUrl.replace(/\/$/, "");

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
