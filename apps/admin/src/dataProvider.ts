import { type UpdateParams, withLifecycleCallbacks } from "ra-core";
import {
  authorizedHttpClient,
  createOrganizationHttpClient,
  isSingleTenantForDomain,
} from "./authProvider";
import auth0DataProvider from "./auth0DataProvider";
import { getConfigValue } from "./utils/runtimeConfig";
import {
  getDomainFromStorage,
  buildUrlWithProtocol,
  deriveTenantSubdomainUrl,
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

/**
 * Resolves the API base URL for tenant-scoped management calls.
 *
 * When the domain config opts into tenant subdomains, calls target
 * `{tenant_id}.{apiHost}` so the server resolves the tenant from the host —
 * the canonical (Auth0-compatible) addressing. Otherwise, and for hosts that
 * can't take a subdomain (loopback, IPs), this falls back to the apex URL,
 * where the `tenant-id` header carries the tenant instead. Control-plane
 * calls (tenant list/create) always use `resolveApiBase` directly.
 */
export function resolveTenantApiBase(
  tenantId: string,
  auth0Domain?: string,
): string {
  const base = resolveApiBase(auth0Domain);
  if (!auth0Domain) return base;

  const domains = getDomainFromStorage();
  const formattedDomain = formatDomain(auth0Domain);
  const domainConfig = domains.find(
    (d) => formatDomain(d.url) === formattedDomain,
  );
  if (!domainConfig?.useTenantSubdomains) return base;

  return deriveTenantSubdomainUrl(base, tenantId) ?? base;
}

export function getDataproviderForTenant(
  tenantId: string,
  auth0Domain?: string,
) {
  let apiUrl = resolveTenantApiBase(tenantId, auth0Domain);

  // Ensure apiUrl doesn't end with a slash
  apiUrl = apiUrl.replace(/\/$/, "");

  const formattedDomain = auth0Domain ? formatDomain(auth0Domain) : "";

  // Create a dynamic httpClient that checks single-tenant mode at REQUEST TIME
  // This is important because the mode may not be known when the dataProvider is created
  const dynamicHttpClient = (url: string, options?: RequestInit) => {
    // In single-tenant mode, use the regular authorized client without organization scope
    // In multi-tenant mode, use organization-scoped client for proper access control
    if (isSingleTenantForDomain(formattedDomain)) {
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
