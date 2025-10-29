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
    // Spread data first, then override id to ensure it matches the resource name
    return {
      data: [{ ...data, id: resource }],
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
        "client-grants": {
          fetch: (client) =>
            client.clientGrants.list({
              page: page - 1,
              per_page: perPage,
              ...(params.filter?.client_id && {
                client_id: params.filter.client_id,
              }),
            }),
          resourceKey: "client_grants",
          idKey: "id",
        },
        forms: {
          fetch: (client) => client.forms.list(),
          resourceKey: "forms",
          idKey: "id",
        },
      };

      // Handle SDK resources
      const handler = sdkHandlers[resource];
      if (handler) {
        const result = await handler.fetch(managementClient);
        const { data, total } = normalizeSDKResponse(
          result,
          handler.resourceKey,
        );
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

      // Use HTTP client for all other list operations
      const headers = createHeaders(tenantId);

      const query: any = {
        include_totals: true,
        page: page - 1,
        per_page: perPage,
        sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
        q: params.filter?.q,
      };

      const url = `${apiUrl}/api/v2/${resourcePath}?${stringify(query)}`;

      try {
        const res = await httpClient(url, { headers });

        // Handle case where API returns an array directly (like custom_domains)
        if (Array.isArray(res.json)) {
          return {
            data: res.json.map((item) => ({
              id: item.id,
              ...item,
            })),
            total: res.json.length,
          };
        }

        // Handle standard case where API returns an object with a property named after the resource
        return {
          data:
            res.json[resource]?.map((item: any) => ({
              id: item.id,
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
      if (resource === "branding") {
        const result = await managementClient.branding.get();
        return {
          data: {
            ...result,
            id: resource,
          },
        };
      }

      if (resource === "settings") {
        const result = await managementClient.tenants.settings.get();
        return {
          data: {
            ...result,
            id: resource,
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
          id: json.id,
          ...json,
        },
      }));
    },

    getMany: (resourcePath, params) => {
      const query = `id:(${params.ids.join(" ")})`;

      const url = `${apiUrl}/api/v2/${resourcePath}?q=${query}`;
      return httpClient(url).then(({ json }) => ({
        data: {
          id: json.id,
          ...json,
        },
      }));
    },

    getManyReference: async (resource, params) => {
      const { page, perPage } = params.pagination;
      const { field, order } = params.sort;
      const managementClient = await getManagementClient();

      // Build common query params for pagination
      const buildPaginationParams = () => ({
        page: page - 1,
        per_page: perPage,
      });

      // Sessions nested under users
      if (resource === "sessions") {
        // Sessions are user-specific, use HTTP
        const headers = createHeaders(tenantId);
        const res = await httpClient(
          `${apiUrl}/api/v2/users/${params.id}/sessions?${stringify({
            include_totals: true,
            ...buildPaginationParams(),
            sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
          })}`,
          { headers },
        );
        return {
          data: res.json.sessions.map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total: res.json.length || 0,
        };
      }

      // Permissions nested under users
      if (resource === "permissions" && params.target === "user_id") {
        const result = await managementClient.users.permissions.list(
          params.id as string,
          buildPaginationParams(),
        );
        const permissions = (result as any).response || result;
        const permissionsArray = Array.isArray(permissions)
          ? permissions
          : permissions.permissions || [];
        return {
          data: permissionsArray.map((item: any) => ({
            id: `${item.resource_server_identifier}:${item.permission_name}`,
            ...item,
          })),
          total: permissionsArray.length || 0,
        };
      }

      // Permissions nested under roles
      if (resource === "permissions" && params.target === "role_id") {
        const result = await managementClient.roles.permissions.list(
          params.id as string,
          buildPaginationParams(),
        );
        const permissions = (result as any).response || result;
        const permissionsArray = Array.isArray(permissions)
          ? permissions
          : permissions.permissions || [];
        return {
          data: permissionsArray.map((item: any) => ({
            id: `${item.resource_server_identifier}:${item.permission_name}`,
            ...item,
          })),
          total: permissionsArray.length || 0,
        };
      }

      // Roles nested under users
      if (resource === "roles" && params.target === "user_id") {
        const result = await managementClient.users.roles.list(
          params.id as string,
        );
        const roles = (result as any).response || result;
        const rolesArray = Array.isArray(roles) ? roles : [];
        return {
          data: rolesArray.map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total: rolesArray.length,
        };
      }

      // Organization members
      if (
        resource === "organization-members" &&
        params.target === "organization_id"
      ) {
        const result = await managementClient.organizations.members.list(
          params.id as string,
          {
            from: String((page - 1) * perPage),
            take: perPage,
          },
        );
        const response = (result as any).response || result;
        const membersData = Array.isArray(response)
          ? response
          : response.members || [];
        const total = response.total || membersData.length;

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
        const result = await managementClient.organizations.invitations.list(
          params.id as string,
          {
            page: page - 1,
            per_page: perPage,
          },
        );
        const response = (result as any).response || result;
        const invitationsData = Array.isArray(response)
          ? response
          : response.invitations || [];
        const total = response.total || invitationsData.length;

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
        const result = await managementClient.users.organizations.list(
          params.id as string,
          {
            page: page - 1,
            per_page: perPage,
          },
        );
        const response = (result as any).response || result;

        let organizationsData: any[];
        let total: number;

        if (Array.isArray(response)) {
          organizationsData = response;
          total = response.length;
        } else if (response.organizations) {
          organizationsData = response.organizations;
          total = response.total || organizationsData.length;
        } else {
          organizationsData = [];
          total = 0;
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

      // Client grants filtered by client_id
      if (resource === "client-grants" && params.target === "client_id") {
        const result = await managementClient.clientGrants.list({
          ...buildPaginationParams(),
          client_id: params.id as string,
        });
        const response = (result as any).response || result;
        const grantsData = Array.isArray(response)
          ? response
          : response.client_grants || [];
        const total = response.total || grantsData.length;

        return {
          data: grantsData.map((item: any) => ({
            id: item.id,
            ...item,
          })),
          total,
        };
      }

      // Default implementation for other resources - use HTTP fallback
      const headers = createHeaders(tenantId);
      const res = await httpClient(
        `${apiUrl}/api/v2/${resource}?${stringify({
          include_totals: true,
          ...buildPaginationParams(),
          sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
          q: `user_id:${params.id}`,
        })}`,
        { headers },
      );

      return {
        data: res.json[resource].map((item: any) => ({
          id: item.id,
          ...item,
        })),
        total: res.json.total,
      };
    },

    update: async (resource, params) => {
      const cleanParams = removeExtraFields(params);
      const managementClient = await getManagementClient();
      const headers = createHeaders(tenantId);

      // Handle singleton resources
      if (resource === "settings") {
        const result = await managementClient.tenants.settings.update(
          cleanParams.data,
        );
        return {
          data: { ...result, id: resource },
        };
      }

      // Special handling for branding to update theme data separately
      if (resource === "branding") {
        if (cleanParams.data.themes) {
          const themeData = cleanParams.data.themes;
          delete cleanParams.data.themes;

          // Update branding using SDK, theme still uses HTTP as SDK may not support it
          const [brandingResult, themeResult] = await Promise.all([
            managementClient.branding.update(cleanParams.data),
            httpClient(`${apiUrl}/api/v2/branding/themes/default`, {
              headers,
              method: "PATCH",
              body: JSON.stringify(themeData),
            })
              .then((res) => res.json)
              .catch((error) => {
                console.warn("Failed to update theme data:", error);
                return {};
              }),
          ]);

          return {
            data: {
              id: resource,
              ...brandingResult,
              themes: themeResult,
            },
          };
        }

        const result = await managementClient.branding.update(cleanParams.data);
        return {
          data: { ...result, id: resource },
        };
      }

      // SDK-handled resources
      if (resource === "users") {
        const result = await managementClient.users.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.user_id,
            ...result,
          },
        };
      }

      if (resource === "clients") {
        const result = await managementClient.clients.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.client_id,
            ...result,
          },
        };
      }

      if (resource === "connections") {
        const result = await managementClient.connections.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.id,
            ...result,
          },
        };
      }

      if (resource === "roles") {
        const result = await managementClient.roles.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.id,
            ...result,
          },
        };
      }

      if (resource === "resource-servers") {
        const result = await managementClient.resourceServers.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.id,
            ...result,
          },
        };
      }

      if (resource === "organizations") {
        const result = await managementClient.organizations.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.id,
            ...result,
          },
        };
      }

      if (resource === "rules") {
        const result = await managementClient.rules.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.id,
            ...result,
          },
        };
      }

      if (resource === "client-grants") {
        const result = await managementClient.clientGrants.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.id,
            ...result,
          },
        };
      }

      // HTTP fallback for other resources
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
        const res = await post(`organizations/${organization_id}/members`, {
          members: usersToAdd,
        });
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
        const res = await post(`organizations/${organization_id}/members`, {
          members: usersToAdd,
        });
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

        const res = await del(
          `users/${user_id}/organizations/${organization_id}`,
        );
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
