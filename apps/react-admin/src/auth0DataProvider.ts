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

// Helper for client-side paging, sorting, and search on pre-fetched data
interface ClientSideListParams {
  data: any[];
  page: number;
  perPage: number;
  sortField?: string;
  sortOrder?: "ASC" | "DESC";
  searchQuery?: string;
  searchFields?: string[];
  idKey?: string;
}

function clientSideListHandler({
  data,
  page,
  perPage,
  sortField,
  sortOrder,
  searchQuery,
  searchFields = ["name"],
  idKey = "id",
}: ClientSideListParams): { data: any[]; total: number } {
  let filtered = data;

  // Apply client-side search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filtered = data.filter((item: any) =>
      searchFields.some((field) =>
        item[field]?.toString().toLowerCase().includes(query),
      ),
    );
  }

  // Apply client-side sorting
  if (sortField) {
    filtered = [...filtered].sort((a: any, b: any) => {
      const aVal = a[sortField] || "";
      const bVal = b[sortField] || "";
      const comparison = String(aVal).localeCompare(String(bVal));
      return sortOrder === "DESC" ? -comparison : comparison;
    });
  }

  // Apply client-side pagination
  const total = filtered.length;
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const paged = filtered.slice(startIndex, endIndex);

  return {
    data: paged.map((item: any) => ({
      id: item[idKey] || item.id,
      ...item,
    })),
    total,
  };
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
      if (!apiUrl) {
        throw new Error(
          "API URL is not configured. Please set restApiUrl in domain configuration or VITE_SIMPLE_REST_URL environment variable.",
        );
      }
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
        // Organizations handled separately with client-side paging/search
        // Logs removed from SDK handlers - using HTTP directly for full control
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
        "custom-domains": {
          fetch: (client: any) => client.customDomains.list(),
          resourceKey: "custom_domains",
          idKey: "custom_domain_id",
        },
        hooks: {
          fetch: (client: any) => client.hooks.list(),
          resourceKey: "hooks",
          idKey: "hook_id",
        },
      };

      // Handle SDK resources (only for top-level resources, not nested paths like users/{id}/roles)
      const handler = sdkHandlers[resource];
      if (handler && !resourcePath.includes("/")) {
        const result = await handler.fetch(managementClient);
        const { data, total } = normalizeSDKResponse(
          result,
          handler.resourceKey,
        );
        return {
          data: data.map((item: any) => ({
            id: item[handler.idKey] || item.id,
            ...item,
          })),
          total,
        };
      }

      // Handle singleton resources
      if (resource === "branding") {
        const branding = await managementClient.branding.get();
        // Also fetch themes to include in branding data
        const headers = createHeaders(tenantId);
        let themes = null;
        try {
          const themesResponse = await httpClient(
            `${apiUrl}/api/v2/branding/themes/default`,
            { headers },
          );
          themes = themesResponse.json;
        } catch (e) {
          // Themes might not exist yet, that's ok
        }
        return {
          data: [
            {
              ...branding,
              themes,
              id: resource,
            },
          ],
          total: 1,
        };
      }

      if (resource === "settings") {
        return fetchSingleton(resource, () =>
          managementClient.tenants.settings.get(),
        );
      }

      // Handle prompts singleton resource
      if (resource === "prompts") {
        const headers = createHeaders(tenantId);
        try {
          const res = await httpClient(`${apiUrl}/api/v2/prompts`, { headers });
          // Also fetch custom text entries list
          let customTextEntries: Array<{ prompt: string; language: string }> =
            [];
          try {
            const customTextRes = await httpClient(
              `${apiUrl}/api/v2/prompts/custom-text`,
              { headers },
            );
            customTextEntries = customTextRes.json || [];
          } catch {
            // Custom text list might not exist yet
          }
          return {
            data: [{ ...res.json, customTextEntries, id: resource }],
            total: 1,
          };
        } catch (error) {
          console.error("Error fetching prompts:", error);
          return {
            data: [{ id: resource, customTextEntries: [] }],
            total: 1,
          };
        }
      }

      // Handle custom-text resource (for individual custom text entries)
      if (resource === "custom-text") {
        const headers = createHeaders(tenantId);
        try {
          const res = await httpClient(
            `${apiUrl}/api/v2/prompts/custom-text`,
            { headers },
          );
          const entries = res.json || [];
          return {
            data: entries.map(
              (e: { prompt: string; language: string }, idx: number) => ({
                id: `${e.prompt}:${e.language}`,
                prompt: e.prompt,
                language: e.language,
              }),
            ),
            total: entries.length,
          };
        } catch (error) {
          console.error("Error fetching custom-text list:", error);
          return { data: [], total: 0 };
        }
      }

      // Handle organizations with client-side paging and search (fetch 500, filter locally)
      if (resource === "organizations" && !resourcePath.includes("/")) {
        const result = await managementClient.organizations.list({
          from: "0",
          take: 500,
        });
        const { data: allOrgs } = normalizeSDKResponse(result, "organizations");

        return clientSideListHandler({
          data: allOrgs,
          page,
          perPage: perPage || 10,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["name", "display_name"],
          idKey: "id",
        });
      }

      // Handle logs with direct HTTP for full control over query params
      if (resource === "logs") {
        const headers = createHeaders(tenantId);
        const query: any = {
          include_totals: true,
          page: page - 1,
          per_page: perPage,
          sort:
            field && order
              ? `${field}:${order === "DESC" ? "-1" : "1"}`
              : undefined,
          ...params.filter, // Pass all filter params directly (q, from, etc.)
        };
        const url = `${apiUrl}/api/v2/logs?${stringify(query)}`;

        const res = await httpClient(url, { headers });
        const response = res.json;
        const logsData = response.logs || response || [];
        const logsArray = Array.isArray(logsData) ? logsData : [];

        return {
          data: logsArray.map((log: any) => ({
            id: log.log_id || log.id,
            ...log,
          })),
          total: response.total || logsArray.length,
        };
      }

      // Handle stats/daily endpoint
      if (resourcePath === "stats/daily") {
        const headers = createHeaders(tenantId);
        const query: any = {};
        if (params.filter?.from) query.from = params.filter.from;
        if (params.filter?.to) query.to = params.filter.to;

        const url = `${apiUrl}/api/v2/stats/daily${Object.keys(query).length ? `?${stringify(query)}` : ""}`;
        try {
          const res = await httpClient(url, { headers });
          // Stats endpoint returns an array directly
          const data = Array.isArray(res.json) ? res.json : [];
          return {
            data: data.map((item: any, index: number) => ({
              id: item.date || index,
              ...item,
            })),
            total: data.length,
          };
        } catch (error) {
          console.error("Error fetching daily stats:", error);
          return { data: [], total: 0 };
        }
      }

      // User organizations - when filtering by user_id
      if (resource === "user-organizations" && params.filter?.user_id) {
        const userId = params.filter.user_id;
        const result = await managementClient.users.organizations.list(userId, {
          page: page - 1,
          per_page: perPage,
        });
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
            user_id: userId,
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

      // Use HTTP client for all other list operations
      const headers = createHeaders(tenantId);

      const query: any = {
        include_totals: true,
        page: page - 1,
        per_page: perPage,
        sort:
          field && order
            ? `${field}:${order === "DESC" ? "-1" : "1"}`
            : undefined,
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
        "custom-domains": {
          fetch: (id) => (managementClient as any).customDomains.get(id),
          idKey: "custom_domain_id",
        },
        flows: {
          fetch: (id) => (managementClient as any).flows.get(id),
          idKey: "id",
        },
        hooks: {
          fetch: (id) => (managementClient as any).hooks.get(id),
          idKey: "hook_id",
        },
        forms: {
          fetch: (id) => managementClient.forms.get(id),
          idKey: "id",
        },
      };

      const handler = sdkGetHandlers[resource];
      if (handler) {
        const result = await handler.fetch(params.id as string);
        // Unwrap SDK response wrapper if present
        const data = (result as any).response || result;

        return {
          data: {
            id: data[handler.idKey] || data.id,
            ...data,
          },
        };
      }

      // Handle singleton resources
      if (resource === "branding") {
        const result = await managementClient.branding.get();
        // Also fetch themes to include in branding data
        const headers = createHeaders(tenantId);
        let themes = null;
        try {
          const themesResponse = await httpClient(
            `${apiUrl}/api/v2/branding/themes/default`,
            { headers },
          );
          themes = themesResponse.json;
        } catch (e) {
          // Themes might not exist yet, that's ok
        }
        return {
          data: {
            ...result,
            themes,
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

      // Handle prompts singleton resource
      if (resource === "prompts") {
        const headers = createHeaders(tenantId);
        try {
          const res = await httpClient(`${apiUrl}/api/v2/prompts`, { headers });
          // Also fetch custom text entries list
          let customTextEntries: Array<{ prompt: string; language: string }> =
            [];
          try {
            const customTextRes = await httpClient(
              `${apiUrl}/api/v2/prompts/custom-text`,
              { headers },
            );
            customTextEntries = customTextRes.json || [];
          } catch {
            // Custom text list might not exist yet
          }
          return {
            data: { ...res.json, customTextEntries, id: resource },
          };
        } catch (error) {
          console.error("Error fetching prompts:", error);
          return {
            data: { id: resource, customTextEntries: [] },
          };
        }
      }

      // Handle custom-text resource (individual entries)
      if (resource === "custom-text") {
        // ID format is "prompt:language"
        const [prompt, language] = params.id.split(":");
        if (!prompt || !language) {
          throw new Error("Invalid custom-text ID format");
        }
        try {
          const result = await managementClient.prompts.customText.get(
            prompt as any,
            language as any,
          );
          return {
            data: {
              id: params.id,
              prompt,
              language,
              texts: result || {},
            },
          };
        } catch (error) {
          console.error("Error fetching custom-text:", error);
          return {
            data: { id: params.id, prompt, language, texts: {} },
          };
        }
      }

      // Handle stats/active-users endpoint
      if (resource === "stats/active-users") {
        const headers = createHeaders(tenantId);
        try {
          const res = await httpClient(`${apiUrl}/api/v2/stats/active-users`, {
            headers,
          });
          // API returns a number directly
          const count = typeof res.json === "number" ? res.json : 0;
          return {
            data: {
              id: "count",
              count,
            },
          };
        } catch (error) {
          console.error("Error fetching active users:", error);
          return {
            data: {
              id: "count",
              count: 0,
            },
          };
        }
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

      // Logs filtered by user_id - use direct HTTP for full control
      if (resource === "logs" && params.target === "user_id") {
        const headers = createHeaders(tenantId);
        const query = {
          page: page - 1,
          per_page: perPage,
          q: `user_id:${params.id}`,
          sort:
            field && order
              ? `${field}:${order === "DESC" ? "-1" : "1"}`
              : undefined,
          include_totals: true,
          ...params.filter, // Allow additional filters to be passed through
        };
        const url = `${apiUrl}/api/v2/logs?${stringify(query)}`;

        const res = await httpClient(url, { headers });
        const response = res.json;
        const logsData = response.logs || response || [];
        const logsArray = Array.isArray(logsData) ? logsData : [];

        return {
          data: logsArray.map((log: any) => ({
            id: log.log_id || log.id,
            ...log,
          })),
          total: response.total || logsArray.length,
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

      // Handle prompts singleton resource
      if (resource === "prompts") {
        const headers = createHeaders(tenantId);
        headers.set("Content-Type", "application/json");
        // Don't send customTextEntries to the settings endpoint
        const { customTextEntries, ...promptsData } = cleanParams.data;
        const res = await httpClient(`${apiUrl}/api/v2/prompts`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(promptsData),
        });
        return {
          data: { ...res.json, customTextEntries, id: resource },
        };
      }

      // Handle custom-text resource
      if (resource === "custom-text") {
        // ID format is "prompt:language"
        const [prompt, language] = params.id.split(":");
        if (!prompt || !language) {
          throw new Error("Invalid custom-text ID format");
        }
        await managementClient.prompts.customText.set(
          prompt as any,
          language as any,
          cleanParams.data.texts || {},
        );
        return {
          data: {
            id: params.id,
            prompt,
            language,
            texts: cleanParams.data.texts || {},
          },
        };
      }

      // Special handling for branding to update theme data separately
      if (resource === "branding") {
        // Extract themes from the payload - it's updated via a separate endpoint
        const { themes, ...brandingData } = cleanParams.data;

        // Update branding (without themes)
        const brandingResult = await managementClient.branding.update(
          brandingData,
        );

        // Update themes if provided
        const result: any = {
          id: resource,
          ...brandingResult,
        };

        if (themes) {
          // Use HTTP directly since the SDK doesn't have this method
          const themeResponse = await httpClient(
            `${apiUrl}/api/v2/branding/themes/default`,
            {
              headers,
              method: "PATCH",
              body: JSON.stringify(themes),
            },
          );
          result.themes = themeResponse.json;
        }

        return { data: result };
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

      if (resource === "custom-domains") {
        const result = await (managementClient as any).customDomains.update(
          params.id as string,
          cleanParams.data,
        );
        return {
          data: {
            id: result.custom_domain_id || result.id,
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
          // Try singular form of resource name (e.g., hooks -> hook_id)
          const singularResource = resource.endsWith("s")
            ? resource.slice(0, -1)
            : resource;
          json.id =
            json[`${singularResource}_id`] || json[`${resource}_id`] || json.id;
        }
        return { data: json };
      });
    },

    updateMany: () => Promise.reject("not supporting updateMany"),

    create: async (resource, params) => {
      const headers = new Headers({ "content-type": "application/json" });
      if (tenantId) headers.set("tenant-id", tenantId);
      const managementClient = await getManagementClient();

      // Handle custom-text resource
      if (resource === "custom-text") {
        const { prompt, language, texts } = params.data;
        if (!prompt || !language) {
          throw new Error("prompt and language are required");
        }
        await managementClient.prompts.customText.set(
          prompt as any,
          language as any,
          texts || {},
        );
        return {
          data: {
            id: `${prompt}:${language}`,
            prompt,
            language,
            texts: texts || {},
          },
        };
      }

      // Helper for POST requests
      const post = async (endpoint: string, body: any) =>
        httpClient(`${apiUrl}/api/v2/${endpoint}`, {
          method: "POST",
          body: JSON.stringify(body),
          headers,
        });

      // SDK resource handlers for create
      const sdkCreateHandlers: Record<
        string,
        { create: (data: any) => Promise<any>; idKey: string }
      > = {
        users: {
          create: (data) => managementClient.users.create(data),
          idKey: "user_id",
        },
        clients: {
          create: (data) => managementClient.clients.create(data),
          idKey: "client_id",
        },
        connections: {
          create: (data) => managementClient.connections.create(data),
          idKey: "id",
        },
        roles: {
          create: (data) => managementClient.roles.create(data),
          idKey: "id",
        },
        "resource-servers": {
          create: (data) => managementClient.resourceServers.create(data),
          idKey: "id",
        },
        organizations: {
          create: (data) => managementClient.organizations.create(data),
          idKey: "id",
        },
        rules: {
          create: (data) => managementClient.rules.create(data),
          idKey: "id",
        },
        "client-grants": {
          create: (data) => managementClient.clientGrants.create(data),
          idKey: "id",
        },
        "custom-domains": {
          create: (data) =>
            (managementClient as any).customDomains.create(data),
          idKey: "custom_domain_id",
        },
      };

      const handler = sdkCreateHandlers[resource];
      if (handler) {
        const result = await handler.create(params.data);
        return {
          data: {
            id: result[handler.idKey] || result.id,
            ...result,
          },
        };
      }

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

      // Default create (for endpoints not in SDK)
      const res = await post(resource, params.data);
      // Try singular form of resource name (e.g., hooks -> hook_id)
      const singularResource = resource.endsWith("s")
        ? resource.slice(0, -1)
        : resource;
      return {
        data: {
          ...res.json,
          id:
            res.json[`${singularResource}_id`] ||
            res.json[`${resource}_id`] ||
            res.json.id,
        },
      };
    },

    delete: async (resource, params) => {
      const managementClient = await getManagementClient();
      const headers = new Headers({ "content-type": "application/json" });
      if (tenantId) headers.set("tenant-id", tenantId);

      // Handle custom-text resource
      if (resource === "custom-text") {
        // ID format is "prompt:language"
        const [prompt, language] = String(params.id).split(":");
        if (!prompt || !language) {
          throw new Error("Invalid custom-text ID format");
        }
        // Auth0 SDK doesn't have delete, so we set to empty object
        // Our backend also supports DELETE, but using set({}) is compatible with Auth0
        await managementClient.prompts.customText.set(
          prompt as any,
          language as any,
          {},
        );
        return { data: { id: params.id } };
      }

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

        await managementClient.organizations.members.delete(organization_id, {
          members: [user_id],
        });
        return { data: { id: params.id } };
      }

      // Custom-domains using SDK
      if (resource === "custom-domains") {
        await (managementClient as any).customDomains.delete(
          params.id as string,
        );
        return { data: { id: params.id } };
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

    deleteMany: async (resource, params) => {
      const headers = new Headers({ "content-type": "text/plain" });
      if (tenantId) headers.set("tenant-id", tenantId);

      const deletedIds: typeof params.ids = [];

      for (const id of params.ids) {
        const resourceUrl = `${resource}/${encodeURIComponent(String(id))}`;
        await httpClient(`${apiUrl}/api/v2/${resourceUrl}`, {
          method: "DELETE",
          headers,
        });
        deletedIds.push(id);
      }

      return { data: deletedIds };
    },
  };
};
