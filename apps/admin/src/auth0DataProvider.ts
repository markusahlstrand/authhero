import { fetchUtils, type DataProvider, type UpdateParams } from "ra-core";
import { createManagementClient } from "./authProvider";
import { ManagementClient } from "auth0";
import { unflattenDomainMetadata } from "./components/custom-domains/domainMetadataUtils";
import {
  EMAIL_TEMPLATE_DEFINITIONS,
  getTemplateLabel,
} from "./resources/email-templates/template-names";

function isNotFoundError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    "statusCode" in err &&
    (err as { statusCode?: number }).statusCode === 404
  );
}

type EmailTemplateDefaults = Record<string, { body: string; subject: string }>;

async function fetchEmailTemplateDefaults(
  apiUrl: string,
  httpClient: typeof fetchUtils.fetchJson,
  tenantId?: string,
): Promise<EmailTemplateDefaults> {
  const headers = new Headers();
  if (tenantId) headers.set("tenant-id", tenantId);
  try {
    const res = await httpClient(`${apiUrl}/api/v2/email-templates/defaults`, {
      headers,
    });
    const entries: Array<{ name: string; body: string; subject: string }> =
      res.json ?? [];
    const out: EmailTemplateDefaults = {};
    for (const e of entries) {
      out[e.name] = { body: e.body, subject: e.subject };
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchEmailTemplateRecord(
  client: ManagementClient,
  name: string,
  defaults: EmailTemplateDefaults = {},
): Promise<Record<string, unknown>> {
  const def = defaults[name];
  try {
    const tpl = await client.emailTemplates.get(
      name as Parameters<typeof client.emailTemplates.get>[0],
    );
    return {
      ...tpl,
      id: name,
      template: name,
      label: getTemplateLabel(name),
      is_override: true,
      default_html: def?.body ?? "",
    };
  } catch (err) {
    if (isNotFoundError(err)) {
      return {
        id: name,
        template: name,
        label: getTemplateLabel(name),
        is_override: false,
        enabled: true,
        subject: "",
        body: "",
        from: "",
        default_html: def?.body ?? "",
      };
    }
    throw err;
  }
}

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

// Remove null and undefined values from an object (used for create operations where empty form fields become null)
function removeNullValues(data: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};
  for (const key of Object.keys(data)) {
    if (data[key] !== null && data[key] !== undefined) {
      cleaned[key] = data[key];
    }
  }
  return cleaned;
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

  // Remove undefined properties (null is preserved to signal "unset this field" in PATCH)
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

// Escape user-supplied filter values before interpolating them into a Lucene
// query string. Escapes backslashes, double quotes, and Lucene reserved
// operators to prevent injection via quote-breaking or special syntax.
function escapeLuceneValue(value: unknown): string {
  const str = String(value);
  return str.replace(
    /[\\"+\-!(){}\[\]^~*?:/]|&&|\|\|/g,
    (match) => `\\${match}`,
  );
}

// Maps react-admin resource names to Auth0 API paths when they differ
const API_PATH_MAP: Record<string, string> = {
  actions: "actions/actions",
  "action-executions": "actions/executions",
};

function getApiPath(resource: string): string {
  return API_PATH_MAP[resource] || resource;
}

// Virtual sub-resource: scopes nested under resource-servers.
// Stored as an array on the parent resource server, but exposed to react-admin
// as its own resource so standard List/Create/Edit components work.
const SCOPE_RES = "resource-server-scopes";

function splitScopeId(id: string | number): readonly [string, string] {
  const s = String(id);
  const i = s.indexOf(":");
  if (i === -1) return ["", ""] as const;
  return [s.slice(0, i), s.slice(i + 1)] as const;
}

async function fetchResourceServerScopes(
  managementClient: ManagementClient,
  rsId: string,
): Promise<{ scopes: any[] }> {
  const result = await managementClient.resourceServers.get(rsId);
  const rs = (result as any).response || result;
  return { scopes: Array.isArray(rs.scopes) ? rs.scopes : [] };
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

// Extended data provider surface for non-CRUD actions (e.g. signing-key
// rotation/revocation) that don't map cleanly to react-admin's standard verbs.
// Consumers call these via useDataProvider<AuthHeroDataProvider>().
export interface AuthHeroDataProvider extends DataProvider {
  rotateSigningKeys: () => Promise<void>;
  revokeSigningKey: (kid: string) => Promise<void>;
  uploadCustomDomainCertificate: (
    id: string,
    cert: { certificate: string; private_key: string },
  ) => Promise<void>;
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
): AuthHeroDataProvider => {
  // Get or create management client for SDK calls
  let managementClientPromise: Promise<ManagementClient> | null = null;
  const getManagementClient = async () => {
    if (!managementClientPromise) {
      if (!apiUrl) {
        throw new Error(
          "API URL is not configured. Please set restApiUrl in domain configuration or VITE_SIMPLE_REST_URL environment variable.",
        );
      }
      managementClientPromise = createManagementClient(
        apiUrl,
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
          fetch: (client) => {
            const { q: rawQ, ...filterPairs } = params.filter || {};
            const extraLucene = Object.entries(filterPairs)
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(([k, v]) => `${k}:"${escapeLuceneValue(v)}"`)
              .join(" ");
            const mergedQ =
              [rawQ, extraLucene].filter(Boolean).join(" ") || undefined;
            return client.users.list({
              page: page - 1,
              per_page: perPage,
              sort:
                field && order
                  ? `${field}:${order === "DESC" ? "-1" : "1"}`
                  : undefined,
              q: mergedQ,
              include_totals: true,
            });
          },
          resourceKey: "users",
          idKey: "user_id",
        },
        // clients handled separately with client-side paging/search
        // connections handled separately with client-side paging/search
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
        hooks: {
          fetch: (client: any) => client.hooks.list(),
          resourceKey: "hooks",
          idKey: "hook_id",
        },
      };

      // Virtual scopes-as-list under resource servers
      if (resource === SCOPE_RES) {
        const rsId = params.filter?.resource_server_id;
        if (!rsId) return { data: [], total: 0 };
        const { scopes } = await fetchResourceServerScopes(
          managementClient,
          rsId,
        );
        return clientSideListHandler({
          data: scopes.map((s: any) => ({
            id: `${rsId}:${s.value}`,
            resource_server_id: rsId,
            value: s.value,
            description: s.description,
          })),
          page,
          perPage: perPage || 25,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["value", "description"],
        });
      }

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
        let themes: Awaited<
          ReturnType<typeof managementClient.branding.themes.getDefault>
        > | null = null;
        try {
          themes = await managementClient.branding.themes.getDefault();
        } catch (err) {
          // 404 means no default theme configured yet; anything else should bubble up.
          if (
            !(
              err &&
              typeof err === "object" &&
              "statusCode" in err &&
              err.statusCode === 404
            )
          ) {
            throw err;
          }
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

      if (resource === "attack-protection") {
        const [bpd, bf, sip] = await Promise.all([
          managementClient.attackProtection.breachedPasswordDetection.get(),
          managementClient.attackProtection.bruteForceProtection.get(),
          managementClient.attackProtection.suspiciousIpThrottling.get(),
        ]);
        return {
          data: [
            {
              id: resource,
              breached_password_detection: bpd,
              brute_force_protection: bf,
              suspicious_ip_throttling: sip,
            },
          ],
          total: 1,
        };
      }

      // MFA singleton: a focused view of tenant settings (mfa + guardian_mfa_page)
      if (resource === "mfa") {
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

      // Handle email-providers singleton resource
      if (resource === "email-providers") {
        try {
          const provider = await managementClient.emails.provider.get();
          return {
            data: [{ ...provider, id: resource }],
            total: 1,
          };
        } catch (err) {
          // Match getOne/update/delete: 404 means no provider configured.
          if (
            err &&
            typeof err === "object" &&
            "statusCode" in err &&
            err.statusCode === 404
          ) {
            return { data: [], total: 0 };
          }
          throw err;
        }
      }

      // Handle email-templates resource. No list endpoint upstream — fan out
      // to GET /{templateName} for each known template, treating 404 as
      // "still on bundled default".
      if (resource === "email-templates") {
        const defaults = await fetchEmailTemplateDefaults(
          apiUrl,
          httpClient,
          tenantId,
        );
        const records = await Promise.all(
          EMAIL_TEMPLATE_DEFINITIONS.map((def) =>
            fetchEmailTemplateRecord(managementClient, def.name, defaults),
          ),
        );
        const sortField = field ?? "label";
        const sortOrder = order ?? "ASC";
        const sorted = [...records].sort((a, b) => {
          const av = String((a as Record<string, unknown>)[sortField] ?? "");
          const bv = String((b as Record<string, unknown>)[sortField] ?? "");
          const cmp = av.localeCompare(bv);
          return sortOrder === "DESC" ? -cmp : cmp;
        });
        return { data: sorted, total: sorted.length };
      }

      // Handle custom-text resource (for individual custom text entries)
      if (resource === "custom-text") {
        const headers = createHeaders(tenantId);
        try {
          const res = await httpClient(`${apiUrl}/api/v2/prompts/custom-text`, {
            headers,
          });
          const entries = res.json || [];
          return {
            data: entries.map((e: { prompt: string; language: string }) => ({
              id: `${e.prompt}:${e.language}`,
              prompt: e.prompt,
              language: e.language,
            })),
            total: entries.length,
          };
        } catch (error) {
          console.error("Error fetching custom-text list:", error);
          return { data: [], total: 0 };
        }
      }

      // Handle custom-text-defaults: bundled default text shipped with
      // authhero. Backs placeholder rendering and field discovery in the
      // admin UI. Auth0 has no equivalent.
      if (resource === "custom-text-defaults") {
        const headers = createHeaders(tenantId);
        const defaultsQuery: Record<string, string> = {};
        if (params.filter?.language)
          defaultsQuery.language = params.filter.language;
        if (params.filter?.prompt) defaultsQuery.prompt = params.filter.prompt;
        const qs = stringify(defaultsQuery);
        const url = qs
          ? `${apiUrl}/api/v2/prompts/custom-text/defaults?${qs}`
          : `${apiUrl}/api/v2/prompts/custom-text/defaults`;
        try {
          const res = await httpClient(url, { headers });
          const entries = res.json || [];
          return {
            data: entries.map(
              (e: {
                prompt: string;
                language: string;
                custom_text: Record<string, Record<string, string>>;
              }) => ({
                id: `${e.prompt}:${e.language}`,
                prompt: e.prompt,
                language: e.language,
                custom_text: e.custom_text,
              }),
            ),
            total: entries.length,
          };
        } catch (error) {
          console.error("Error fetching custom-text defaults:", error);
          return { data: [], total: 0 };
        }
      }

      // Handle connections with client-side paging and search (fetch all, filter locally)
      if (resource === "connections" && !resourcePath.includes("/")) {
        const result = await managementClient.connections.list();
        const { data: allConnections } = normalizeSDKResponse(
          result,
          "connections",
        );

        return clientSideListHandler({
          data: allConnections,
          page,
          perPage: perPage || 10,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["name", "strategy", "id"],
          idKey: "id",
        });
      }

      // Handle clients with client-side paging and search (fetch all, filter locally)
      if (resource === "clients" && !resourcePath.includes("/")) {
        const result = await managementClient.clients.list({
          page: 0,
          per_page: 500,
          include_totals: false,
        });
        const { data: allClients } = normalizeSDKResponse(result, "clients");

        return clientSideListHandler({
          data: allClients,
          page,
          perPage: perPage || 10,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["name", "client_id"],
          idKey: "client_id",
        });
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

      // Signing keys are served at /api/v2/keys/signing and use `kid` as their
      // identifier (no `id` field). The endpoint returns a plain array with no
      // pagination, so we fetch everything and let clientSideListHandler paginate.
      if (resource === "signing-keys") {
        const headers = createHeaders(tenantId);
        const res = await httpClient(`${apiUrl}/api/v2/keys/signing`, {
          headers,
        });
        const items: Array<Record<string, unknown>> = Array.isArray(res.json)
          ? (res.json as Array<Record<string, unknown>>)
          : [];
        const withIds = items.map((item) => ({ id: item.kid, ...item }));
        return clientSideListHandler({
          data: withIds,
          page,
          perPage: perPage || 25,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["kid", "thumbprint", "fingerprint"],
          idKey: "id",
        });
      }

      // Handle custom-domains with client-side paging and search
      if (resource === "custom-domains" && !resourcePath.includes("/")) {
        const result = await (managementClient as any).customDomains.list();
        const { data: allDomains } = normalizeSDKResponse(
          result,
          "custom_domains",
        );

        return clientSideListHandler({
          data: allDomains,
          page,
          perPage: perPage || 10,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["domain", "custom_domain_id"],
          idKey: "custom_domain_id",
        });
      }

      // Handle logs with direct HTTP for full control over query params
      if (resource === "logs") {
        const headers = createHeaders(tenantId);
        const { q: rawQ, from, to, ...filterPairs } = params.filter || {};
        const extraLucene = Object.entries(filterPairs)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${k}:"${escapeLuceneValue(v)}"`)
          .join(" ");
        const mergedQ =
          [rawQ, extraLucene].filter(Boolean).join(" ") || undefined;
        const query: any = {
          include_totals: true,
          page: page - 1,
          per_page: perPage,
          sort:
            field && order
              ? `${field}:${order === "DESC" ? "-1" : "1"}`
              : undefined,
          q: mergedQ,
          from,
          to,
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
        try {
          const stats = await managementClient.stats.getDaily({
            from: params.filter?.from,
            to: params.filter?.to,
          });
          const data = Array.isArray(stats) ? stats : [];
          return {
            data: data.map((item, index) => ({
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

      const { q, ...filterFields } = params.filter || {};
      const query: any = {
        include_totals: true,
        page: page - 1,
        per_page: perPage,
        sort:
          field && order
            ? `${field}:${order === "DESC" ? "-1" : "1"}`
            : undefined,
        q,
        ...filterFields,
      };

      const url = `${apiUrl}/api/v2/${getApiPath(resourcePath)}?${stringify(query)}`;

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

        // Handle standard case where API returns an object with a property
        // named after the resource. The response key is snake_cased (e.g.
        // `proxy_routes`) while the resource path is hyphenated.
        const list =
          res.json[resource] ?? res.json[resource.replace(/-/g, "_")];
        return {
          data:
            list?.map((item: any) => ({
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

      // Virtual scopes-as-one under resource servers
      if (resource === SCOPE_RES) {
        const [rsId, value] = splitScopeId(params.id);
        if (!rsId) throw new Error(`Invalid scope id: ${params.id}`);
        const { scopes } = await fetchResourceServerScopes(
          managementClient,
          rsId,
        );
        const scope = scopes.find((s: any) => s.value === value);
        if (!scope) {
          throw new Error(
            `Scope "${value}" not found on resource server ${rsId}`,
          );
        }
        return {
          data: {
            id: params.id,
            resource_server_id: rsId,
            value: scope.value,
            description: scope.description,
          },
        };
      }

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

        const record = {
          id: data[handler.idKey] || data.id,
          ...data,
        };

        return {
          data:
            resource === "custom-domains"
              ? unflattenDomainMetadata(record)
              : record,
        };
      }

      // Handle singleton resources
      if (resource === "branding") {
        const result = await managementClient.branding.get();
        let themes: Awaited<
          ReturnType<typeof managementClient.branding.themes.getDefault>
        > | null = null;
        try {
          themes = await managementClient.branding.themes.getDefault();
        } catch (err) {
          // 404 means no default theme configured yet; anything else should bubble up.
          if (
            !(
              err &&
              typeof err === "object" &&
              "statusCode" in err &&
              err.statusCode === 404
            )
          ) {
            throw err;
          }
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

      if (resource === "attack-protection") {
        const [bpd, bf, sip] = await Promise.all([
          managementClient.attackProtection.breachedPasswordDetection.get(),
          managementClient.attackProtection.bruteForceProtection.get(),
          managementClient.attackProtection.suspiciousIpThrottling.get(),
        ]);
        return {
          data: {
            id: resource,
            breached_password_detection: bpd,
            brute_force_protection: bf,
            suspicious_ip_throttling: sip,
          },
        };
      }

      if (resource === "mfa") {
        const result = await managementClient.tenants.settings.get();
        return {
          data: { ...result, id: resource },
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

      // Handle email-providers singleton resource
      if (resource === "email-providers") {
        try {
          const provider = await managementClient.emails.provider.get();
          return {
            data: { ...provider, id: resource },
          };
        } catch (err) {
          // No provider configured yet — render the form with sensible defaults.
          // Anything other than 404 (401/403/5xx/network) should bubble up.
          if (
            err &&
            typeof err === "object" &&
            "statusCode" in err &&
            err.statusCode === 404
          ) {
            return {
              data: { id: resource, enabled: true, credentials: {} },
            };
          }
          throw err;
        }
      }

      // Handle email-templates: fetch the tenant override, fall back to a
      // blank record on 404 so the form can render with defaults.
      if (resource === "email-templates") {
        const defaults = await fetchEmailTemplateDefaults(
          apiUrl,
          httpClient,
          tenantId,
        );
        const record = await fetchEmailTemplateRecord(
          managementClient,
          String(params.id),
          defaults,
        );
        return { data: record };
      }

      // Handle custom-text resource (individual entries)
      if (resource === "custom-text") {
        // ID format is "prompt:language"
        const [prompt, language] = String(params.id).split(":") || [];
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
        try {
          const result = await managementClient.stats.getActiveUsersCount();
          const count = typeof result === "number" ? result : 0;
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

      // Action executions also need the per-action captured console output,
      // which lives at a sibling path (/logs) rather than on the main record.
      if (resource === "action-executions") {
        const headers = createHeaders(tenantId);
        const base = `${apiUrl}/api/v2/actions/executions/${params.id}`;
        const [execRes, logsRes] = await Promise.all([
          httpClient(base, { headers }),
          httpClient(`${base}/logs`, { headers }).catch(() => ({
            json: { logs: [] },
          })),
        ]);
        return {
          data: {
            ...execRes.json,
            id: execRes.json.id || params.id,
            execution_logs: logsRes.json?.logs ?? [],
          },
        };
      }

      // Logs use log_id as their identifier, not id.
      if (resource === "logs") {
        const headers = createHeaders(tenantId);
        const { json } = await httpClient(
          `${apiUrl}/api/v2/logs/${params.id}`,
          { headers },
        );
        return {
          data: {
            ...json,
            id: json.log_id || json.id || params.id,
          },
        };
      }

      // HTTP for other resources
      const headers = createHeaders(tenantId);
      return httpClient(
        `${apiUrl}/api/v2/${getApiPath(resource)}/${params.id}`,
        {
          headers,
        },
      ).then(({ json }) => ({
        data: {
          id: json.id,
          ...json,
        },
      }));
    },

    getMany: (resourcePath, params) => {
      const query = `id:(${params.ids.join(" ")})`;

      const headers = createHeaders(tenantId);
      const url = `${apiUrl}/api/v2/${getApiPath(resourcePath)}?q=${query}`;
      return httpClient(url, { headers }).then(({ json }) => ({
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

      // Virtual scopes nested under a resource server
      if (resource === SCOPE_RES && params.target === "resource_server_id") {
        const rsId = String(params.id);
        const { scopes } = await fetchResourceServerScopes(
          managementClient,
          rsId,
        );
        return clientSideListHandler({
          data: scopes.map((s: any) => ({
            id: `${rsId}:${s.value}`,
            resource_server_id: rsId,
            value: s.value,
            description: s.description,
          })),
          page,
          perPage: perPage || 25,
          sortField: field,
          sortOrder: order,
          searchQuery: params.filter?.q,
          searchFields: ["value", "description"],
        });
      }

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

      // OAuth grants (Auth0-style /api/v2/grants?user_id=...)
      if (resource === "grants" && params.target === "user_id") {
        const headers = createHeaders(tenantId);
        const res = await httpClient(
          `${apiUrl}/api/v2/grants?${stringify({
            user_id: params.id,
            include_totals: true,
            ...buildPaginationParams(),
            sort: `${field}:${order === "DESC" ? "-1" : "1"}`,
          })}`,
          { headers },
        );
        const grants = res.json.grants || [];
        return {
          data: grants.map((item: any) => ({ id: item.id, ...item })),
          total: res.json.length || grants.length || 0,
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

      // Logs filtered by user_id - includes logs from linked accounts
      if (resource === "logs" && params.target === "user_id") {
        const headers = createHeaders(tenantId);
        const { q: rawQ, from, to, ...filterPairs } = params.filter || {};
        const extraLucene = Object.entries(filterPairs)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => `${k}:"${escapeLuceneValue(v)}"`)
          .join(" ");
        const mergedQ =
          [rawQ, extraLucene].filter(Boolean).join(" ") || undefined;
        const query = {
          page: page - 1,
          per_page: perPage,
          sort:
            field && order
              ? `${field}:${order === "DESC" ? "-1" : "1"}`
              : undefined,
          include_totals: true,
          q: mergedQ,
          from,
          to,
        };
        const url = `${apiUrl}/api/v2/users/${encodeURIComponent(
          String(params.id),
        )}/logs?${stringify(query)}`;

        const res = await httpClient(url, { headers });
        const response = res.json;
        const logsData = response.logs || response || [];
        const logsArray = Array.isArray(logsData) ? logsData : [];

        return {
          data: logsArray.map((log: any) => ({
            id: log.log_id || log.id,
            ...log,
          })),
          total: response.length || logsArray.length,
        };
      }

      // Default implementation for other resources - use HTTP fallback
      const headers = createHeaders(tenantId);
      const res = await httpClient(
        `${apiUrl}/api/v2/${getApiPath(resource)}?${stringify({
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

      // Virtual scope update: read-modify-write the parent's scopes array
      if (resource === SCOPE_RES) {
        const [rsId, originalValue] = splitScopeId(params.id);
        if (!rsId) throw new Error(`Invalid scope id: ${params.id}`);
        const { scopes } = await fetchResourceServerScopes(
          managementClient,
          rsId,
        );
        const idx = scopes.findIndex((s: any) => s.value === originalValue);
        if (idx === -1) {
          throw new Error(`Scope "${originalValue}" no longer exists`);
        }
        const newValue = cleanParams.data.value || originalValue;
        const newDescription =
          cleanParams.data.description ?? scopes[idx].description ?? "";
        if (
          newValue !== originalValue &&
          scopes.some((s: any, i: number) => i !== idx && s.value === newValue)
        ) {
          throw new Error(`Scope "${newValue}" already exists`);
        }
        const newScopes = scopes.map((s: any, i: number) =>
          i === idx ? { value: newValue, description: newDescription } : s,
        );
        await managementClient.resourceServers.update(rsId, {
          scopes: newScopes,
        });
        return {
          data: {
            id: `${rsId}:${newValue}`,
            resource_server_id: rsId,
            value: newValue,
            description: newDescription,
          },
        };
      }

      // Handle singleton resources
      if (resource === "settings") {
        const result = await managementClient.tenants.settings.update(
          cleanParams.data,
        );
        return {
          data: { ...result, id: resource },
        };
      }

      if (resource === "mfa") {
        // The MFA form only edits mfa.* and guardian_mfa_page.*; everything
        // else on `tenants.settings` is left untouched by sending only those
        // keys. Drop synthetic id before submitting.
        const { id: _id, ...rest } = cleanParams.data;
        const patch: Record<string, unknown> = {};
        if (rest.mfa !== undefined) patch.mfa = rest.mfa;
        if (rest.guardian_mfa_page !== undefined) {
          patch.guardian_mfa_page = rest.guardian_mfa_page;
        }
        const result = await managementClient.tenants.settings.update(patch);
        return { data: { ...result, id: resource } };
      }

      if (resource === "attack-protection") {
        const ap = managementClient.attackProtection;
        // Run sequentially so that a failure aborts subsequent updates,
        // and the returned data reflects only operations that succeeded.
        const bpd = await ap.breachedPasswordDetection.update(
          cleanParams.data.breached_password_detection ?? {},
        );
        const bf = await ap.bruteForceProtection.update(
          cleanParams.data.brute_force_protection ?? {},
        );
        const sip = await ap.suspiciousIpThrottling.update(
          cleanParams.data.suspicious_ip_throttling ?? {},
        );
        return {
          data: {
            id: resource,
            breached_password_detection: bpd,
            brute_force_protection: bf,
            suspicious_ip_throttling: sip,
          },
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

      // Handle email-providers singleton resource. Match Auth0 semantics:
      // PATCH to update, POST to create. PATCH 404s when no row exists yet,
      // so we fall back to POST in that case.
      if (resource === "email-providers") {
        const { id: _id, ...body } = cleanParams.data;
        try {
          const updated = await managementClient.emails.provider.update(body);
          return {
            data: { ...updated, id: resource },
          };
        } catch (err: unknown) {
          const status = (err as { statusCode?: number } | undefined)
            ?.statusCode;
          if (status !== 404) throw err;
          const created = await managementClient.emails.provider.create(
            body as Parameters<
              typeof managementClient.emails.provider.create
            >[0],
          );
          return {
            data: { ...created, id: resource },
          };
        }
      }

      // Handle email-templates: PUT upserts by template name, so we always
      // call `set` regardless of override existence.
      if (resource === "email-templates") {
        const templateName = String(params.id);
        const body = cleanParams.data as Parameters<
          typeof managementClient.emailTemplates.set
        >[1];
        const updated = await managementClient.emailTemplates.set(
          templateName as Parameters<
            typeof managementClient.emailTemplates.set
          >[0],
          body,
        );
        return {
          data: {
            ...updated,
            id: templateName,
            template: templateName,
            label: getTemplateLabel(templateName),
            is_override: true,
          },
        };
      }

      // Handle custom-text resource
      if (resource === "custom-text") {
        // ID format is "prompt:language"
        const [prompt, language] = String(params.id).split(":");
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
        const brandingResult =
          await managementClient.branding.update(brandingData);

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
      return httpClient(
        `${apiUrl}/api/v2/${getApiPath(resource)}/${params.id}`,
        {
          headers,
          method: "PATCH",
          body: JSON.stringify(cleanParams.data),
        },
      ).then(({ json }) => {
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

      // Virtual scope create: append to the parent's scopes array
      if (resource === SCOPE_RES) {
        const { resource_server_id: rsId, value, description } = params.data;
        if (!rsId || !value) {
          throw new Error("resource_server_id and value are required");
        }
        const { scopes } = await fetchResourceServerScopes(
          managementClient,
          rsId,
        );
        if (scopes.some((s: any) => s.value === value)) {
          throw new Error(`Scope "${value}" already exists`);
        }
        const newScope = { value, description: description || "" };
        await managementClient.resourceServers.update(rsId, {
          scopes: [...scopes, newScope],
        });
        return {
          data: {
            id: `${rsId}:${value}`,
            resource_server_id: rsId,
            value,
            description: newScope.description,
          },
        };
      }

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

      // User identity link (Auth0 SDK)
      const userIdentitiesMatch = resource.match(
        /^users\/([^/]+)\/identities$/,
      );
      if (userIdentitiesMatch?.[1]) {
        const primaryUserId = userIdentitiesMatch[1];
        // Auth0 expects either link_with=<JWT> or { provider, user_id }.
        // The admin UI passes link_with=<raw user_id> (e.g. "auth0|abc"),
        // so split on "|" into provider + user_id when it's not a JWT.
        let payload = params.data;
        const linkWith = params.data?.link_with;
        if (typeof linkWith === "string" && linkWith.includes("|")) {
          const sep = linkWith.indexOf("|");
          if (sep > 0) {
            const { link_with, ...rest } = params.data;
            payload = {
              ...rest,
              provider: linkWith.slice(0, sep),
              user_id: linkWith.slice(sep + 1),
            };
          }
        }
        const result = await managementClient.users.identities.link(
          primaryUserId,
          payload,
        );
        const identities =
          (result as any).data || (result as any).response || result;
        return {
          data: {
            id: primaryUserId,
            identities,
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
      // Clean up null values from form data
      const cleanedData = removeNullValues(params.data);
      const res = await post(getApiPath(resource), cleanedData);
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

      // Virtual scope delete: filter out from the parent's scopes array
      if (resource === SCOPE_RES) {
        const [rsId, value] = splitScopeId(params.id);
        if (!rsId) throw new Error(`Invalid scope id: ${params.id}`);
        const { scopes } = await fetchResourceServerScopes(
          managementClient,
          rsId,
        );
        const newScopes = scopes.filter((s: any) => s.value !== value);
        await managementClient.resourceServers.update(rsId, {
          scopes: newScopes,
        });
        return { data: { id: params.id } };
      }

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

      // Handle email-providers singleton resource — DELETE returns 204.
      if (resource === "email-providers") {
        try {
          await managementClient.emails.provider.delete();
        } catch (err: unknown) {
          // 404 means already deleted — treat as success.
          const status = (err as { statusCode?: number } | undefined)
            ?.statusCode;
          if (status !== 404) throw err;
        }
        return { data: { id: resource } };
      }

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

      // User identity unlink (Auth0 SDK)
      const userIdentityMatch = resource.match(
        /^users\/([^/]+)\/identities\/([^/]+)$/,
      );
      if (userIdentityMatch?.[1] && userIdentityMatch?.[2]) {
        const [, primaryUserId, provider] = userIdentityMatch;
        type UnlinkProvider = Parameters<
          typeof managementClient.users.identities.delete
        >[1];
        const result = await managementClient.users.identities.delete(
          primaryUserId,
          provider as UnlinkProvider,
          String(params.id),
        );
        const response =
          (result as { data?: unknown; response?: unknown }).data ??
          (result as { response?: unknown }).response ??
          result;
        return { data: { id: params.id, identities: response } };
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
        ? `${getApiPath(resource)}/${encodeURIComponent(String(params.id))}`
        : getApiPath(resource);

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
        const resourceUrl = `${getApiPath(resource)}/${encodeURIComponent(String(id))}`;
        await httpClient(`${apiUrl}/api/v2/${resourceUrl}`, {
          method: "DELETE",
          headers,
        });
        deletedIds.push(id);
      }

      return { data: deletedIds };
    },

    rotateSigningKeys: async () => {
      await httpClient(`${apiUrl}/api/v2/keys/signing/rotate`, {
        method: "POST",
        headers: createHeaders(tenantId),
      });
    },

    revokeSigningKey: async (kid: string) => {
      await httpClient(
        `${apiUrl}/api/v2/keys/signing/${encodeURIComponent(kid)}/revoke`,
        {
          method: "PUT",
          headers: createHeaders(tenantId),
        },
      );
    },

    uploadCustomDomainCertificate: async (id, cert) => {
      await httpClient(
        `${apiUrl}/api/v2/custom-domains/${encodeURIComponent(id)}/certificate`,
        {
          method: "PUT",
          headers: createHeaders(tenantId),
          body: JSON.stringify(cert),
        },
      );
    },
  };
};
