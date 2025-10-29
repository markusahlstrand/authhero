import { fetchUtils, DataProvider } from "ra-core";
import { UpdateParams } from "react-admin";
import { createManagementClient } from "./authProvider";
import { ManagementClient } from "auth0";

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
    case "organization_invitations":
      return "id";
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
    case "settings":
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
const SINGLETON_RESOURCES = ["branding", "branding/themes/default", "settings"];

// Map resource names to their actual API paths
function getResourcePath(resource: string): string {
  if (resource === "settings") {
    return "tenants/settings";
  }
  return resource;
}

// Helper to normalize SDK response format variations
function normalizeSDKResponse(
  result: any,
  resourceKey: string,
): { data: any[]; total: number } {
  const response = (result as any).response || {};

  // Handle direct array format
  if (Array.isArray(response)) {
    return { data: response, total: response.length };
  }

  // Handle SDK wrapper format with resource key
  if (response[resourceKey]) {
    return {
      data: response[resourceKey],
      total: response.total || response.length || response[resourceKey].length,
    };
  }

  // Handle result itself being the array
  if (Array.isArray(result)) {
    return { data: result, total: result.length };
  }

  // Fallback to empty array
  return { data: [], total: 0 };
}

// Helper to create headers with tenant ID
function createHeaders(tenantId?: string): Headers {
  const headers = new Headers();
  if (tenantId) {
    headers.set("tenant-id", tenantId);
  }
  return headers;
}

// Helper to handle singleton resource fetching
async function fetchSingleton(
  resource: string,
  fetcher: () => Promise<any>,
): Promise<{ data: any[]; total: number }> {
  try {
    const result = await fetcher();
    const data = (result as any).response || result;
    return {
      data: [{ id: resource, ...data }],
      total: 1,
    };
  } catch (error) {
    console.error(`Error in getList for ${resource}:`, error);
    return {
      data: [{ id: resource }],
      total: 1,
    };
  }
}

/**
 * Maps react-admin queries to the auth0 management api
 * Uses HTTP client for all API calls with custom headers for tenant isolation
 */
export default (
  apiUrl: string,
  httpClient = fetchUtils.fetchJson,
  tenantId?: string,
  domain?: string,
): DataProvider => {
  // Get or create management client for SDK calls
  let managementClientPromise: Promise<ManagementClient> | null = null;
  const getManagementClient = async () => {
    if (!managementClientPromise) {
      // Extract API domain from apiUrl
      const apiDomain = apiUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      // Pass both API domain and OAuth domain for authentication
      managementClientPromise = createManagementClient(
        apiDomain,
        tenantId,
        domain,
      );
    }
    return managementClientPromise;
  };

  return {
    getList: async (resourcePath, params) => {
      const resource = parseResource(resourcePath);
      const { page = 1, perPage } = params.pagination || {};
      const { field, order } = params.sort || {};
      const managementClient = await getManagementClient();

      // SDK resource handlers configuration
      const sdkHandlers: Record<
        string,
        {
          fetch: (client: ManagementClient) => Promise<any>;
          resourceKey: string;
          idKey: string;
        }
      > = {
        users: {
          fetch: (client) =>
            client.users.list({
              page: page - 1,
              per_page: perPage,
              sort:
                field && order
                  ? `${field}:${order === "DESC" ? "-1" : "1"}`
                  : undefined,
              q: params.filter?.q,
              include_totals: true,
            }),
          resourceKey: "users",
          idKey: "user_id",
        },
        clients: {
          fetch: (client) =>
            client.clients.list({
              page: page - 1,
              per_page: perPage,
              include_totals: true,
            }),
          resourceKey: "clients",
          idKey: "client_id",
        },
        connections: {
          fetch: (client) => client.connections.list(),
          resourceKey: "connections",
          idKey: "id",
        },
        roles: {
          fetch: (client) =>
            client.roles.list({
              page: page - 1,
              per_page: perPage,
            }),
          resourceKey: "roles",
          idKey: "id",
        },
        "resource-servers": {
          fetch: (client) => client.resourceServers.list(),
          resourceKey: "resource_servers",
          idKey: "id",
        },
        organizations: {
          fetch: (client) =>
            client.organizations.list({
              from: String((page - 1) * (perPage || 10)),
              take: perPage || 10,
            }),
          resourceKey: "organizations",
          idKey: "id",
        },
        logs: {
          fetch: (client) =>
            client.logs.list({
              page: page - 1,
              per_page: perPage,
              q: params.filter?.q,
            }),
          resourceKey: "logs",
          idKey: "log_id",
        },
        rules: {
          fetch: (client) => client.rules.list(),
          resourceKey: "rules",
          idKey: "id",
        },
      };

      // Handle SDK resources
      const handler = sdkHandlers[resource];
      if (handler) {
        const result = await handler.fetch(managementClient);
        const { data, total } = normalizeSDKResponse(result, handler.resourceKey);
        return {
          data: data.map((item: any) => ({
            id: item[handler.idKey],
            ...item,
          })),
          total,
        };
      }

      // Handle singleton resources
      if (resource === "branding") {
        return fetchSingleton(resource, () => managementClient.branding.get());
      }

      if (resource === "settings") {
        return fetchSingleton(resource, () =>
          managementClient.tenants.settings.get(),
        );
      }

      // Handle other singleton resources with HTTP (like branding/themes/default)
      if (SINGLETON_RESOURCES.includes(resource)) {
        const headers = createHeaders(tenantId);
        const resourcePath = getResourcePath(resource);

        try {
          const res = await httpClient(`${apiUrl}/api/v2/${resourcePath}`, {
            headers,
          });
          return {
            data: [{ id: resource, ...res.json }],
            total: 1,
          };
        } catch (error) {
          console.error(`Error in getList for singleton ${resource}:`, error);
          return {
            data: [{ id: resource }],
            total: 1,
          };
        }
      }

      // Use HTTP client for all other list operations
      const headers = createHeaders(tenantId);

      // Special case for forms endpoint which doesn't accept query parameters
      let url;
      if (resource === "forms") {
        url = `${apiUrl}/api/v2/${resourcePath}`;
      } else {
        const query: any = {
          include_totals: true,
          page: page - 1,
          per_page: perPage,
          sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
          q: params.filter?.q,
        };

        // Special case for client-grants to support client_id filtering
        if (resource === "client-grants" && params.filter?.client_id) {
          query.client_id = params.filter.client_id;
        }

        url = `${apiUrl}/api/v2/${resourcePath}?${stringify(query)}`;
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

        // Handle special case for client-grants (API uses client_grants key)
        if (resource === "client-grants") {
          const clientGrants = res.json.client_grants || [];
          return {
            data: clientGrants.map((item: any) => ({
              id: item[getIdKeyFromResource("client_grants")],
              ...item,
            })),
            total: res.json.total || clientGrants.length,
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

    getOne: async (resource, params) => {
      const managementClient = await getManagementClient();

      // SDK resource handlers for getOne
      const sdkGetHandlers: Record<
        string,
        { fetch: (id: string) => Promise<any>; idKey: string }
      > = {
        users: {
          fetch: (id) => managementClient.users.get(id),
          idKey: "user_id",
        },
        clients: {
          fetch: (id) => managementClient.clients.get(id),
          idKey: "client_id",
        },
      };

      const handler = sdkGetHandlers[resource];
      if (handler) {
        const result = await handler.fetch(params.id as string);
        return {
          data: {
            id: result[handler.idKey],
            ...result,
          },
        };
      }

      // Handle singleton resources
      if (SINGLETON_RESOURCES.includes(resource)) {
        const headers = createHeaders(tenantId);
        const resourcePath = getResourcePath(resource);
        const res = await httpClient(`${apiUrl}/api/v2/${resourcePath}`, {
          headers,
        });
        return {
          data: {
            id: resource,
            ...res.json,
          },
        };
      }

      // Special handling for tenants - fetch from list and find by ID
      if (resource === "tenants") {
        const headers = createHeaders(tenantId);

        try {
          const res = await httpClient(`${apiUrl}/api/v2/tenants`, {
            headers,
          });

          const tenants = res.json.tenants || [];
          const tenant = tenants.find(
            (t: any) => t.id === params.id || t.tenant_id === params.id,
          );

          if (tenant) {
            return {
              data: {
                id: tenant.id || tenant.tenant_id,
                ...tenant,
              },
            };
          }

          return {
            data: {
              id: params.id,
              name: params.id,
            },
          };
        } catch (error) {
          console.warn(`Could not fetch tenant ${params.id}:`, error);
          return {
            data: {
              id: params.id,
              name: params.id,
            },
          };
        }
      }

      // HTTP for other resources
      const headers = createHeaders(tenantId);
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
      const headers = createHeaders(tenantId);

      // Build common query params
      const buildQuery = (includeTotals = true) => ({
        include_totals: includeTotals,
        page: page - 1,
        per_page: perPage,
        sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
      });

      // Helper to fetch nested resource
      const fetchNested = async (endpoint: string, query?: any) => {
        const url = query
          ? `${apiUrl}/api/v2/${endpoint}?${stringify(query)}`
          : `${apiUrl}/api/v2/${endpoint}`;
        return httpClient(url, { headers });
      };

      // Sessions nested under users
      if (resource === "sessions") {
        const res = await fetchNested(
          `users/${params.id}/sessions`,
          buildQuery(),
        );
        return {
          data: res.json.sessions.map((item: any) => ({ id: item.id, ...item })),
          total: res.json.length || 0,
        };
      }

      // Permissions nested under users
      if (resource === "permissions" && params.target === "user_id") {
        const res = await fetchNested(
          `users/${params.id}/permissions`,
          buildQuery(),
        );
        return {
          data: res.json.map((item: any) => ({
            id: `${item.resource_server_identifier}:${item.permission_name}`,
            ...item,
          })),
          total: res.json.length || 0,
        };
      }

      // Permissions nested under roles
      if (resource === "permissions" && params.target === "role_id") {
        const res = await fetchNested(
          `roles/${params.id}/permissions`,
          buildQuery(false),
        );
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

      // Roles nested under users
      if (resource === "roles" && params.target === "user_id") {
        const res = await fetchNested(`users/${params.id}/roles`);
        return {
          data: (Array.isArray(res.json) ? res.json : []).map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total: Array.isArray(res.json) ? res.json.length : 0,
        };
      }

      // Organization members
      if (
        resource === "organization-members" &&
        params.target === "organization_id"
      ) {
        const res = await fetchNested(
          `organizations/${params.id}/members`,
          buildQuery(),
        );
        const membersData = Array.isArray(res.json)
          ? res.json
          : res.json.members || res.json;
        const total = res.json.total || membersData.length;

        return {
          data: membersData.map((item: any) => ({
            id: `${params.id}_${item.user_id}`,
            organization_id: params.id,
            ...item,
          })),
          total,
        };
      }

      // Organization invitations
      if (
        resource === "organization-invitations" &&
        params.target === "organization_id"
      ) {
        const res = await fetchNested(
          `organizations/${params.id}/invitations`,
          buildQuery(),
        );
        const invitationsData = Array.isArray(res.json)
          ? res.json
          : res.json.invitations || res.json;
        const total =
          res.json.total || res.json.length || invitationsData.length;

        return {
          data: invitationsData.map((item: any) => ({
            id: item.id,
            organization_id: params.id,
            ...item,
          })),
          total,
        };
      }

      // User organizations
      if (resource === "user-organizations" && params.target === "user_id") {
        const res = await fetchNested(
          `users/${params.id}/organizations`,
          buildQuery(),
        );

        let organizationsData: any[];
        let total: number;

        if (Array.isArray(res.json)) {
          organizationsData = res.json;
          total = res.json.length;
        } else if (res.json.organizations) {
          organizationsData = res.json.organizations;
          total = res.json.total || organizationsData.length;
        } else {
          organizationsData = res.json.organizations || [];
          total = res.json.total || organizationsData.length;
        }

        return {
          data: organizationsData.map((org: any) => ({
            id: org.id || org.organization_id,
            user_id: params.id,
            name: org.name,
            display_name: org.display_name,
            branding: org.branding,
            metadata: org.metadata || {},
            token_quota: org.token_quota,
            created_at: org.created_at,
            updated_at: org.updated_at,
            ...org,
          })),
          total,
        };
      }

      // Client grants
      if (resource === "client-grants" && params.target === "client_id") {
        const res = await fetchNested(
          "client-grants",
          { ...buildQuery(), client_id: params.id },
        );
        return {
          data: (res.json.client_grants || []).map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total: res.json.total || res.json.length || 0,
        };
      }

      // Default implementation for other resources
      const res = await fetchNested(
        resource,
        { ...buildQuery(), q: `user_id:${params.id}` },
      );

      return {
        data: res.json[resource].map((item: any) => ({
          id: item[getIdKeyFromResource(resource)],
          ...item,
        })),
        total: res.json.total,
      };
    },

    update: async (resource, params) => {
      const cleanParams = removeExtraFields(params);
      const headers = createHeaders(tenantId);

      // Handle singleton resources
      if (SINGLETON_RESOURCES.includes(resource)) {
        const resourcePath = getResourcePath(resource);

        // Special handling for branding to update theme data separately
        if (resource === "branding" && cleanParams.data.themes) {
          const themeData = cleanParams.data.themes;
          delete cleanParams.data.themes;

          // Update branding and theme data in parallel
          return Promise.all([
            httpClient(`${apiUrl}/api/v2/${resourcePath}`, {
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

        return httpClient(`${apiUrl}/api/v2/${resourcePath}`, {
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
      const headers = new Headers({ "content-type": "application/json" });
      if (tenantId) headers.set("tenant-id", tenantId);

      // Helper for POST requests
      const post = async (endpoint: string, body: any) =>
        httpClient(`${apiUrl}/api/v2/${endpoint}`, {
          method: "POST",
          body: JSON.stringify(body),
          headers,
        });

      // Organization invitations
      if (resource === "organization-invitations") {
        const { organization_id, ...inviteData } = params.data;
        const res = await post(
          `organizations/${organization_id}/invitations`,
          inviteData,
        );
        return {
          data: {
            id: res.json.id,
            organization_id,
            ...res.json,
          },
        };
      }

      // Organization members
      if (resource === "organization-members") {
        const { organization_id, user_id, user_ids } = params.data;
        const usersToAdd = user_ids || [user_id];
        const res = await post(
          `organizations/${organization_id}/members`,
          { members: usersToAdd },
        );
        return {
          data: {
            id: `${organization_id}_${usersToAdd.join("_")}`,
            organization_id,
            user_id: user_id || usersToAdd[0],
            members: usersToAdd,
            ...res.json,
          },
        };
      }

      // User organizations (same endpoint as org members)
      if (resource === "user-organizations") {
        const { organization_id, user_id, user_ids } = params.data;
        const usersToAdd = user_ids || [user_id];
        const res = await post(
          `organizations/${organization_id}/members`,
          { members: usersToAdd },
        );
        return {
          data: {
            id: organization_id,
            user_id: user_id || usersToAdd[0],
            members: usersToAdd,
            organization_id,
            ...res.json,
          },
        };
      }

      // User roles assignment
      const userRolesMatch = resource.match(/^users\/([^/]+)\/roles$/);
      if (userRolesMatch) {
        const res = await post(resource, params.data);
        const userId = userRolesMatch[1];
        const roleIds = params.data?.roles || [];
        return {
          data: {
            id: `${userId}_${roleIds.join("_")}`,
            user_id: userId,
            roles: roleIds,
            ...res.json,
          },
        };
      }

      // Default create
      const res = await post(resource, params.data);
      return {
        data: {
          ...res.json,
          id: res.json.id,
        },
      };
    },

    delete: async (resource, params) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (tenantId) headers.set("tenant-id", tenantId);

      // Helper for DELETE requests
      const del = async (endpoint: string, body?: any) =>
        httpClient(`${apiUrl}/api/v2/${endpoint}`, {
          method: "DELETE",
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

      // Organization invitations
      if (resource === "organization-invitations") {
        const invitation_id = params.id;
        const organization_id = params.previousData?.organization_id;

        if (!organization_id || !invitation_id) {
          throw new Error(
            "Missing organization_id or invitation_id for invitation deletion",
          );
        }

        const res = await del(
          `organizations/${organization_id}/invitations/${invitation_id}`,
        );
        return { data: res.json || { id: invitation_id } };
      }

      // Organization members
      if (resource === "organization-members") {
        let organization_id, user_ids;

        if (params.previousData?.members) {
          organization_id = params.id;
          user_ids = params.previousData.members;
        } else if (typeof params.id === "string" && params.id.includes("_")) {
          [organization_id, ...user_ids] = params.id.split("_");
        } else if (params.previousData) {
          organization_id = params.previousData.organization_id || params.id;
          user_ids = params.previousData.user_ids || [
            params.previousData.user_id,
          ];
        }

        if (!organization_id || !user_ids || user_ids.length === 0) {
          throw new Error(
            "Missing organization_id or user_id(s) for organization member deletion",
          );
        }

        const res = await del(`organizations/${organization_id}/members`, {
          members: user_ids,
        });
        return { data: res.json };
      }

      // User organizations
      if (resource === "user-organizations") {
        let organization_id, user_id;

        if (params.previousData) {
          user_id = params.previousData.user_id;
          organization_id = params.id;
        } else if (typeof params.id === "string" && params.id.includes("_")) {
          [user_id, organization_id] = params.id.split("_");
        }

        if (!organization_id || !user_id) {
          throw new Error(
            "Missing organization_id or user_id for user organization deletion",
          );
        }

        const res = await del(`users/${user_id}/organizations/${organization_id}`);
        return { data: res.json };
      }

      // Nested permissions/roles detection
      const isNestedPermissionsDelete =
        /(^|\/)users\/[^/]+\/permissions$/.test(resource) ||
        /(^|\/)roles\/[^/]+\/permissions$/.test(resource);
      const isNestedRolesDelete = /(^|\/)users\/[^/]+\/roles$/.test(resource);
      const isOrgMemberRolesDelete =
        /(^|\/)organizations\/[^/]+\/members\/[^/]+\/roles$/.test(resource);

      const hasId =
        params?.id !== undefined &&
        params?.id !== null &&
        String(params.id) !== "";

      const shouldAppendId =
        hasId &&
        !(
          isNestedPermissionsDelete ||
          isNestedRolesDelete ||
          isOrgMemberRolesDelete
        );

      const resourceUrl = shouldAppendId
        ? `${resource}/${encodeURIComponent(String(params.id))}`
        : resource;

      let body: any = undefined;

      if (isNestedPermissionsDelete) {
        const prev: any = params?.previousData ?? {};
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

        body = {
          permissions: [
            {
              permission_name:
                prev.permission_name ?? parsedFromId.permission_name,
              resource_server_identifier:
                prev.resource_server_identifier ??
                parsedFromId.resource_server_identifier,
            },
          ],
        };
      } else if (isNestedRolesDelete || isOrgMemberRolesDelete) {
        const roles = Array.isArray(params?.previousData?.roles)
          ? params.previousData.roles
          : hasId
            ? [String(params.id)]
            : [];
        body = { roles };
      }

      // Update headers for nested endpoints
      if (
        !isNestedPermissionsDelete &&
        !isNestedRolesDelete &&
        !isOrgMemberRolesDelete
      ) {
        headers.set("Content-Type", "text/plain");
      }

      const res = await httpClient(`${apiUrl}/api/v2/${resourceUrl}`, {
        method: "DELETE",
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      return { data: res.json };
    },

    deleteMany: () => Promise.reject("not supporting deleteMany"),
  };
};
