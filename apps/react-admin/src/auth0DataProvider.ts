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
      return "id";
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
    case "resource_servers":
      return "id";
    default:
      console.warn(
        `No specific ID key defined for resource "${resource}", falling back to "${resource}_id" or "id"`,
      );
      // Try resource-specific ID first, then generic ID
      return `${normalizedResource}_id`;
  }
}

// List of singleton resources (no id in URL, e.g. /api/v2/branding)
const SINGLETON_RESOURCES = ["branding", "branding/themes/default"];

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
          q: params.filter?.q,
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

        // Handle special case for resource-servers (API uses resource_servers key)
        if (resource === "resource-servers") {
          const resourceServers = res.json.resource_servers || [];
          return {
            data: resourceServers.map((item: any) => ({
              id: item[getIdKeyFromResource("resource_servers")],
              ...item,
            })),
            total: res.json.length || resourceServers.length,
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
        // Special handling for branding to include theme data
        if (resource === "branding") {
          return Promise.all([
            httpClient(`${apiUrl}/api/v2/${resource}`, { headers }),
            httpClient(`${apiUrl}/api/v2/branding/themes/default`, {
              headers,
            }).catch(() => ({ json: {} })),
          ]).then(([brandingResponse, themeResponse]) => ({
            data: {
              id: resource,
              ...brandingResponse.json,
              themes: themeResponse.json,
            },
          }));
        }

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

      // Special case for permissions which are nested under users
      if (resource === "permissions" && params.target === "user_id") {
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

        const url = `${apiUrl}/api/v2/users/${params.id}/permissions?${stringify(query)}`;
        const res = await httpClient(url, { headers });

        return {
          data: res.json.map((item: any) => ({
            id: `${item.resource_server_identifier}:${item.permission_name}`,
            ...item,
          })),
          total: res.json.length || 0,
        };
      }

      // Special case for permissions which are nested under roles
      if (resource === "permissions" && params.target === "role_id") {
        const headers = new Headers();
        if (tenantId) {
          headers.set("tenant-id", tenantId);
        }

        const query = {
          include_totals: false,
          page: page - 1,
          per_page: perPage,
          sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
        } as any;

        const url = `${apiUrl}/api/v2/roles/${params.id}/permissions?${stringify(query)}`;
        const res = await httpClient(url, { headers });

        // API returns an array of permissions with details
        const arr = Array.isArray(res.json)
          ? res.json
          : res.json?.permissions || [];
        return {
          data: arr.map((item: any) => ({
            id: `${item.resource_server_identifier}:${item.permission_name}`,
            ...item,
          })),
          total: arr.length || 0,
        };
      }

      // Special case for roles which are nested under users
      if (resource === "roles" && params.target === "user_id") {
        const headers = new Headers();
        if (tenantId) headers.set("tenant-id", tenantId);

        const url = `${apiUrl}/api/v2/users/${params.id}/roles`;
        const res = await httpClient(url, { headers });

        return {
          data: (Array.isArray(res.json) ? res.json : []).map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total: Array.isArray(res.json) ? res.json.length : 0,
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
        // Special handling for branding to update theme data separately
        if (resource === "branding" && cleanParams.data.themes) {
          const themeData = cleanParams.data.themes;
          delete cleanParams.data.themes;

          // Update branding and theme data in parallel
          return Promise.all([
            httpClient(`${apiUrl}/api/v2/${resource}`, {
              headers,
              method: "PATCH",
              body: JSON.stringify(cleanParams.data),
            }),
            httpClient(`${apiUrl}/api/v2/branding/themes/default`, {
              headers,
              method: "PATCH",
              body: JSON.stringify(themeData),
            }).catch((error) => {
              console.warn("Failed to update theme data:", error);
              return { json: {} };
            }),
          ]).then(([brandingResponse, themeResponse]) => ({
            data: {
              id: resource,
              ...brandingResponse.json,
              themes: themeResponse.json,
            },
          }));
        }

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
      // Special case: assign roles to user via POST /users/:id/roles
      const userRolesMatch = resource.match(/^users\/([^/]+)\/roles$/);
      if (userRolesMatch) {
        const headers = new Headers({ "content-type": "application/json" });
        if (tenantId) headers.set("tenant-id", tenantId);

        const res = await httpClient(`${apiUrl}/api/v2/${resource}`, {
          method: "POST",
          body: JSON.stringify(params.data),
          headers,
        });

        return { data: res.json };
      }

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
      // Detect special case: DELETE /users/:userId/permissions or /roles/:roleId/permissions with JSON body
      const isNestedPermissionsDelete =
        /(^|\/)users\/[^/]+\/permissions$/.test(resource) ||
        /(^|\/)roles\/[^/]+\/permissions$/.test(resource);

      // Also support nested roles deletion: DELETE /users/:userId/roles
      const isNestedRolesDelete = /(^|\/)users\/[^/]+\/roles$/.test(resource);

      const headers = new Headers({
        "Content-Type":
          isNestedPermissionsDelete || isNestedRolesDelete
            ? "application/json"
            : "text/plain",
      });
      if (tenantId) headers.set("tenant-id", tenantId);

      const hasId =
        params &&
        params.id !== undefined &&
        params.id !== null &&
        String(params.id) !== "";
      const shouldAppendId =
        hasId && !(isNestedPermissionsDelete || isNestedRolesDelete);

      const baseUrl = `${apiUrl}/api/v2/${resource}`;
      const resourceUrl = shouldAppendId
        ? `${baseUrl}/${encodeURIComponent(String(params.id))}`
        : baseUrl;

      let body: string | undefined = undefined;

      if (isNestedPermissionsDelete) {
        // Build payload from previousData or params.id when available
        const prev: any = (params as any)?.previousData ?? {};
        const parsedFromId = (() => {
          if (!hasId)
            return {
              resource_server_identifier: undefined,
              permission_name: undefined,
            };
          try {
            const decoded = decodeURIComponent(String(params.id));
            const [rsi, pname] = decoded.split(":");
            return { resource_server_identifier: rsi, permission_name: pname };
          } catch {
            return {
              resource_server_identifier: undefined,
              permission_name: undefined,
            };
          }
        })();

        const permission_name =
          prev.permission_name ?? parsedFromId.permission_name;
        const resource_server_identifier =
          prev.resource_server_identifier ??
          parsedFromId.resource_server_identifier;

        body = JSON.stringify({
          permissions: [
            {
              permission_name,
              resource_server_identifier,
            },
          ],
        });
      } else if (isNestedRolesDelete) {
        const roles = Array.isArray((params as any)?.previousData?.roles)
          ? (params as any).previousData.roles
          : hasId
            ? [String(params.id)]
            : [];
        body = JSON.stringify({ roles });
      }

      const res = await httpClient(resourceUrl, {
        method: "DELETE",
        headers,
        body,
      });
      return { data: res.json };
    },
    deleteMany: () => Promise.reject("not supporting updateMany"),
  };
};
