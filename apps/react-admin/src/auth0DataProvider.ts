import { fetchUtils, DataProvider } from "ra-core";
import { UpdateParams } from "react-admin";

// Add this at the top of the file with other imports
function stringify(obj: Record<string, any>): string {
  return Object.entries(obj)
    .filter(([_, value]) => value !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
}

function removeExtraFields(params: UpdateParams) {
  // delete params.data?.id; // this is required for patch... but not for put?
  delete params.data?.tenant_id;
  delete params.data?.updated_at;
  delete params.data?.created_at;
  delete params.data?.identities;

  // hmmmmm, this is an issue we have here with mismatching structure?
  // seems like we need to modify our endpoints to accept connections.
  // TBD with Markus
  delete params.data?.connections;

  // actually Auth0 does not require this for patching. seems dangerous not to rely on an auto-id
  // as may get rejected for having the same id
  delete params.data?.id;
  // for user we don't want to include this
  delete params.data?.user_id;

  // extra user fields
  delete params.data?.last_login;
  delete params.data?.provider;

  // Remove empty properties
  Object.keys(params.data).forEach((key) => {
    if (params.data[key] === undefined) {
      delete params.data[key];
    }
  });

  return params;
}

function getIdKeyFromResource(resource: string) {
  switch (resource) {
    case "connections":
      return "connnection_id";
    case "domains":
      return "domain_id";
    case "users":
      return "user_id";
    case "logs":
      return "log_id";
    case "hooks":
      return "hook_id";
    case "tenants":
      return "tenant_id";
    case "clients":
      return "client_id";
    default:
      throw new Error(`unknown resource ${resource}`);
  }
}

/**
 * Maps react-admin queries to the auth0 mamagement api
 */
export default (
  apiUrl: string,
  httpClient = fetchUtils.fetchJson,
  tenantId?: string,
): DataProvider => {
  console.log(
    "Creating auth0DataProvider with apiUrl:",
    apiUrl,
    "tenantId:",
    tenantId,
  );

  return {
    getList: async (resource, params) => {
      console.log(
        "getList called for resource:",
        resource,
        "with params:",
        params,
      );

      const { page = 1, perPage } = params.pagination || {};
      const { field, order } = params.sort || {};

      const query = {
        include_totals: true,
        page: page - 1,
        per_page: perPage,
        sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
        q: params.filter?.q || "", // Make q optional with default empty string
      };
      const url = `${apiUrl}/api/v2/${resource}?${stringify(query)}`;

      console.log("Making request to URL:", url);
      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      try {
        const res = await httpClient(url, { headers });
        console.log("getList received response:", res);

        return {
          data:
            res.json[resource]?.map((item: any) => ({
              id: item[getIdKeyFromResource(resource)],
              ...item,
            })) || [],
          total: res.json.length || 0,
        };
      } catch (error) {
        console.error("Error in getList:", error);
        throw error;
      }
    },

    getOne: (resource, params) => {
      console.log(
        "getOne called for resource:",
        resource,
        "with params:",
        params,
      );
      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      return httpClient(`${apiUrl}/api/v2/${resource}/${params.id}`, {
        headers,
      }).then(({ json }) => ({
        data: {
          id: json[getIdKeyFromResource(resource)],
          ...json,
        },
      }));
    },

    getMany: (resource, params) => {
      console.log(
        "getMany called for resource:",
        resource,
        "with params:",
        params,
      );
      const query = `${getIdKeyFromResource(resource)}:(${params.ids.join(" ")})})`;

      const url = `${apiUrl}/api/v2/${resource}?q=${query}`;
      return httpClient(url).then(({ json }) => ({
        data: {
          id: json[getIdKeyFromResource(resource)],
          ...json,
        },
      }));
    },

    getManyReference: async (resource, params) => {
      const { page, perPage } = params.pagination;
      const { field, order } = params.sort;

      const query = {
        include_totals: true,
        page: page - 1,
        per_page: perPage,
        sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
        q: `user_id:${params.id}`,
      };

      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      const url = `${apiUrl}/api/v2/${resource}?${stringify(query)}`;

      const res = await httpClient(url, { headers });

      return {
        data: res.json[resource].map((item: any) => ({
          id: item[getIdKeyFromResource(resource)],
          ...item,
        })),
        total: res.json.length,
      };
    },

    update: (resource, params) => {
      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      const cleanParams = removeExtraFields(params);

      return httpClient(`${apiUrl}/api/v2/${resource}/${params.id}`, {
        headers,
        method: "PATCH",
        body: JSON.stringify(cleanParams.data),
      }).then(({ json }) => {
        if (!json.id) {
          json.id = json[`${resource}_id`];
          delete json[`${resource}_id`];
        }
        return { data: json };
      });
    },

    updateMany: () => Promise.reject("not supporting updateMany"),

    create: async (resource, params) => {
      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      const res = await httpClient(`${apiUrl}/api/v2/${resource}`, {
        method: "POST",
        body: JSON.stringify(params.data),
        headers,
      });

      const data = {
        ...res.json,
        id: res.json.id,
      };

      return {
        data,
      };
    },

    delete: async (resource, params) => {
      const headers = new Headers({
        "Content-Type": "text/plain",
      });

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      const res = await httpClient(
        `${apiUrl}/api/v2/${resource}/${params.id}`,
        {
          method: "DELETE",
          headers,
        },
      );

      return {
        data: res.json,
      };
    },
    deleteMany: () => Promise.reject("not supporting updateMany"),
  };
};
