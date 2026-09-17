import { McpToolError, type ToolApi } from "./dispatch";

/**
 * A single MCP tool. `inputSchema` is a JSON Schema advertised verbatim via
 * `tools/list`; `handler` returns JSON-serializable data that the protocol
 * layer wraps as text content.
 */
export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  handler: (api: ToolApi, args: Record<string, unknown>) => Promise<unknown>;
}

type JsonSchemaProperties = Record<string, Record<string, unknown>>;

interface ToolSpec {
  name: string;
  title: string;
  description: string;
  /** Whether the tool targets a single tenant (adds `tenant_id` off-host). */
  tenantScoped: boolean;
  properties?: JsonSchemaProperties;
  required?: string[];
  handler: McpToolDef["handler"];
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

const requireStr = (value: unknown, name: string): string => {
  const s = str(value);
  if (!s) throw new McpToolError(`Missing required argument: ${name}`);
  return s;
};

/** Accept numbers or numeric strings; models send both. */
const intStr = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return typeof value === "string" && /^\d+$/.test(value) ? value : undefined;
};

// Keys whose values must never reach a model's context, wherever they appear:
// client and signing secrets, connection credentials, key material.
const SECRET_KEY =
  /secret|password|private_key|api_key|^pkcs7$|^signing_keys$|^encryption_key$|^credentials$/i;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [
        key,
        SECRET_KEY.test(key) ? "[redacted]" : redactSecrets(inner),
      ]),
    );
  }
  return value;
}

const pagingProperties: JsonSchemaProperties = {
  page: {
    type: "integer",
    minimum: 0,
    description: "Page index, starting at 0.",
  },
  per_page: {
    type: "integer",
    minimum: 1,
    maximum: 100,
    description: "Results per page (default 50, max 100).",
  },
};

const paging = (args: Record<string, unknown>) => ({
  page: intStr(args.page),
  per_page: intStr(args.per_page),
  include_totals: "true",
});

const TOOL_SPECS: ToolSpec[] = [
  {
    name: "list_tenants",
    title: "List tenants",
    description:
      "List the tenants you have access to. Use a returned tenant_id as the `tenant_id` argument for the other tools.",
    tenantScoped: false,
    handler: (api) => api.listTenants(),
  },
  {
    name: "get_tenant_settings",
    title: "Get tenant settings",
    description:
      "Get a tenant's settings: name, support details, session lifetimes, flags and similar.",
    tenantScoped: true,
    handler: (api, args) =>
      api.management(api.tenantFor(args), { path: "/tenants/settings" }),
  },
  {
    name: "list_users",
    title: "List users",
    description:
      'Search a tenant\'s users. `q` is a Lucene query such as `email:"jane@example.com"` or `name:jane*`.',
    tenantScoped: true,
    properties: {
      q: { type: "string", description: "Lucene query to filter users." },
      ...pagingProperties,
    },
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: "/users",
        query: { q: str(args.q), ...paging(args) },
      }),
  },
  {
    name: "get_user",
    title: "Get user",
    description: "Get a single user by user_id, including linked identities.",
    tenantScoped: true,
    properties: {
      user_id: {
        type: "string",
        description: "The user id, e.g. `auth0|abc123`.",
      },
    },
    required: ["user_id"],
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: `/users/${encodeURIComponent(requireStr(args.user_id, "user_id"))}`,
      }),
  },
  {
    name: "list_clients",
    title: "List applications",
    description:
      "List a tenant's applications (clients). Secrets are redacted.",
    tenantScoped: true,
    properties: { ...pagingProperties },
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: "/clients",
        query: paging(args),
      }),
  },
  {
    name: "get_client",
    title: "Get application",
    description: "Get a single application (client). Secrets are redacted.",
    tenantScoped: true,
    properties: {
      client_id: { type: "string", description: "The client id." },
    },
    required: ["client_id"],
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: `/clients/${encodeURIComponent(requireStr(args.client_id, "client_id"))}`,
      }),
  },
  {
    name: "list_connections",
    title: "List connections",
    description:
      "List a tenant's connections (database, passwordless, social, enterprise). Credentials are redacted.",
    tenantScoped: true,
    properties: { ...pagingProperties },
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: "/connections",
        query: paging(args),
      }),
  },
  {
    name: "list_resource_servers",
    title: "List APIs",
    description: "List a tenant's APIs (resource servers) and their scopes.",
    tenantScoped: true,
    properties: { ...pagingProperties },
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: "/resource-servers",
        query: paging(args),
      }),
  },
  {
    name: "list_roles",
    title: "List roles",
    description: "List a tenant's roles.",
    tenantScoped: true,
    properties: { ...pagingProperties },
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: "/roles",
        query: paging(args),
      }),
  },
  {
    name: "search_logs",
    title: "Search logs",
    description:
      'Search a tenant\'s logs, newest first. `q` is a Lucene query such as `type:f` (failed logins) or `user_id:"auth0|abc"`.',
    tenantScoped: true,
    properties: {
      q: { type: "string", description: "Lucene query to filter log events." },
      ...pagingProperties,
    },
    handler: (api, args) =>
      api.management(api.tenantFor(args), {
        path: "/logs",
        query: { q: str(args.q), sort: "date:-1", ...paging(args) },
      }),
  },
];

/**
 * Build the tool list for one mode. On the control-plane host every
 * tenant-scoped tool takes a required `tenant_id`; on a tenant's own host the
 * tenant is implied and `list_tenants` is not offered.
 */
export function buildTools(pinnedTenantId?: string): McpToolDef[] {
  return TOOL_SPECS.filter((spec) => spec.tenantScoped || !pinnedTenantId).map(
    (spec) => {
      const withTenant = spec.tenantScoped && !pinnedTenantId;
      const properties: JsonSchemaProperties = withTenant
        ? {
            tenant_id: {
              type: "string",
              description:
                "The tenant to operate on. Call list_tenants to find the ids you can access.",
            },
            ...spec.properties,
          }
        : { ...spec.properties };
      const required = [
        ...(withTenant ? ["tenant_id"] : []),
        ...(spec.required ?? []),
      ];

      return {
        name: spec.name,
        description: spec.description,
        inputSchema: {
          type: "object",
          properties,
          ...(required.length ? { required } : {}),
          additionalProperties: false,
        },
        annotations: { title: spec.title, readOnlyHint: true },
        handler: async (api, args) =>
          redactSecrets(await spec.handler(api, args)),
      };
    },
  );
}

export function buildInstructions(pinnedTenantId?: string): string {
  if (pinnedTenantId) {
    return (
      `Read-only access to the AuthHero Management API for the tenant "${pinnedTenantId}". ` +
      "Every tool operates on this tenant."
    );
  }
  return (
    "Read-only access to the AuthHero Management API. You may have access to several tenants. " +
    "Call `list_tenants` first, then pass the chosen `tenant_id` to the other tools."
  );
}
