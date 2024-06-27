import { UpdateParams, withLifecycleCallbacks } from "react-admin";
import { authorizedHttpClient } from "./authProvider";
import auth0DataProvider from "./auth0DataProvider";

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

export function getDataprovider() {
  // TODO - duplicate auth0DataProvider to tenantsDataProvider
  // we are introducing non-auth0 endpoints AND we odn't require the tenants-id header
  const provider = auth0DataProvider(
    import.meta.env.VITE_SIMPLE_REST_URL,
    authorizedHttpClient,
  );

  return withLifecycleCallbacks(provider, [
    {
      resource: "tenants",
      beforeUpdate: removeExtraFields,
    },
  ]);
}

export function getDataproviderForTenant(tenantId: string) {
  const restUrl = new URL(import.meta.env.VITE_SIMPLE_REST_URL);
  restUrl.pathname = `tenants/${tenantId}`;

  const auth0Provider = auth0DataProvider(
    import.meta.env.VITE_SIMPLE_REST_URL,
    authorizedHttpClient,
    tenantId,
  );

  return auth0Provider;
}
