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

function parseResource(resourcePath: string) {
  return resourcePath.split("/").pop() || resourcePath;
}

function getIdKeyFromResource(resource: string) {
  // Normalize resource name by converting hyphens to underscores
  const normalizedResource = resource.replace(/-/g, "_");

  switch (normalizedResource) {
    case "connections":
      return "connnection_id";
    case "custom_domains":
      return "custom_domain_id";
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
    case "sessions":
      return "id";
    case "roles":
      return "role_id";
    case "permissions":
      return "permission_id";
    case "organizations":
      return "organization_id";
    case "actions":
      return "action_id";
    case "branding":
      return "branding_id";
    case "prompts":
      return "prompt_id";
    case "rules":
      return "rule_id";
    case "emails":
      return "email_id";
    case "email_templates":
      return "template_id";
    case "forms":
      return "form_id";
    default:
      console.warn(
        `No specific ID key defined for resource "${resource}", falling back to "${resource}_id" or "id"`,
      );
      // Try resource-specific ID first, then generic ID
      return `${normalizedResource}_id`;
  }
}

// List of singleton resources (no id in URL, e.g. /api/v2/branding)
const SINGLETON_RESOURCES = ["branding"];

/**
 * Maps react-admin queries to the auth0 mamagement api
 */
export default (
  apiUrl: string,
  httpClient = fetchUtils.fetchJson,
  tenantId?: string,
): DataProvider => {
  return {
    getList: async (resourcePath, params) => {
      const resource = parseResource(resourcePath);
      const { page = 1, perPage } = params.pagination || {};
      const { field, order } = params.sort || {};

      // Special case for forms endpoint which doesn't accept query parameters
      let url;
      if (resource === "forms") {
        url = `${apiUrl}/api/v2/${resourcePath}`;
      } else {
        const query = {
          include_totals: true,
          page: page - 1,
          per_page: perPage,
          sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
          q: params.filter?.q || "", // Make q optional with default empty string
        };
        url = `${apiUrl}/api/v2/${resourcePath}?${stringify(query)}`;
      }

      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      try {
        const res = await httpClient(url, { headers });

        // Handle case where API returns an array directly (like custom_domains)
        if (Array.isArray(res.json)) {
          return {
            data: res.json.map((item) => ({
              id: item[getIdKeyFromResource(resource)],
              ...item,
            })),
            total: res.json.length,
          };
        }

        // Handle special case for forms resource which returns a simple array
        if (resource === "forms") {
          const forms = res.json[resource] || [];
          return {
            data: forms.map((item: any) => ({
              id: item[getIdKeyFromResource(resource)],
              ...item,
            })),
            total: forms.length,
          };
        }

        // Handle standard case where API returns an object with a property named after the resource
        return {
          data:
            res.json[resource]?.map((item: any) => ({
              id: item[getIdKeyFromResource(resource)],
              ...item,
            })) || [],
          total: res.json.total || res.json.length || 0,
        };
      } catch (error) {
        console.error("Error in getList:", error);
        throw error;
      }
    },

    getOne: (resource, params) => {
      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      // Handle singleton resources
      if (SINGLETON_RESOURCES.includes(resource)) {
        return httpClient(`${apiUrl}/api/v2/${resource}`, {
          headers,
        }).then(({ json }) => ({
          data: {
            id: resource, // Use a constant id for singleton
            ...json,
          },
        }));
      }

      return httpClient(`${apiUrl}/api/v2/${resource}/${params.id}`, {
        headers,
      }).then(({ json }) => ({
        data: {
          id: json.id || json[getIdKeyFromResource(resource)],
          ...json,
        },
      }));
    },

    getMany: (resourcePath, params) => {
      const resource = parseResource(resourcePath);
      const query = `${getIdKeyFromResource(resource)}:(${params.ids.join(" ")})})`;

      const url = `${apiUrl}/api/v2/${resourcePath}?q=${query}`;
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

      // Special case for sessions which are nested under users
      if (resource === "sessions") {
        const headers = new Headers();
        if (tenantId) {
          headers.set("tenant-id", tenantId);
        }

        const query = {
          include_totals: true,
          page: page - 1,
          per_page: perPage,
          sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
        };

        const url = `${apiUrl}/api/v2/users/${params.id}/sessions?${stringify(query)}`;
        const res = await httpClient(url, { headers });

        return {
          data: res.json.sessions.map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total: res.json.length || 0,
        };
      }

      // Original implementation for other resources
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
        total: res.json.total,
      };
    },

    update: (resource, params) => {
      const headers = new Headers();

      if (tenantId) {
        headers.set("tenant-id", tenantId);
      }

      const cleanParams = removeExtraFields(params);

      // Handle singleton resources
      if (SINGLETON_RESOURCES.includes(resource)) {
        return httpClient(`${apiUrl}/api/v2/${resource}`, {
          headers,
          method: "PATCH",
          body: JSON.stringify(cleanParams.data),
        }).then(({ json }) => ({
          data: { id: resource, ...json },
        }));
      }

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
      const headers = new Headers({
        "content-type": "application/json",
      });

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
