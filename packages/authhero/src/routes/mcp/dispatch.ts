import type { Context, ExecutionContext } from "hono";
import type { Organization } from "@authhero/adapter-interfaces";
import type { Bindings, Variables, McpConfig } from "../../types";
import { MANAGEMENT_API_AUDIENCE } from "../../middlewares/authentication";
import { TOKEN_EXCHANGE_GRANT_TYPE } from "../../authentication-flows/token-exchange";
import { fetchAll } from "../../utils/fetchAll";

/**
 * A tool-level error whose message is safe to show to the model as the
 * `isError` text of a tool result.
 */
export class McpToolError extends Error {}

/** The root app the tools dispatch into (token endpoint + management API). */
export interface FetchableApp {
  fetch(
    request: Request,
    env: Bindings,
    executionCtx?: ExecutionContext,
  ): Response | Promise<Response>;
}

/** The authenticated MCP caller, resolved by the bearer middleware. */
export interface McpCaller {
  /** The caller's raw control-plane access token (the exchange subject). */
  subjectToken: string;
  userId: string;
  controlPlaneTenantId: string;
  controlPlaneIssuer: string;
  /** Set when the endpoint was reached on a tenant's own host. */
  pinnedTenantId?: string;
}

export interface ManagementRequest {
  /** Path below `/api/v2`, e.g. `/users`. */
  path: string;
  method?: string;
  /** Query params; undefined and empty values are dropped. */
  query?: Record<string, string | undefined>;
}

export interface AccessibleTenant {
  tenant_id: string;
  display_name?: string;
}

export interface ToolApi {
  pinnedTenantId?: string;
  /** Tenants the caller can reach: their control-plane organizations. */
  listTenants(): Promise<AccessibleTenant[]>;
  /** The tenant a call targets: the pinned host tenant, else `tenant_id`. */
  tenantFor(args: Record<string, unknown>): string;
  /** Call the management API for a tenant as the caller. */
  management(tenantId: string, request: ManagementRequest): Promise<unknown>;
}

const ACCESS_TOKEN_TYPE = "urn:ietf:params:oauth:token-type:access_token";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build the per-request tool API. Every management call:
 *
 * 1. Looks up the caller's control-plane organization named after the target
 *    tenant (organization name == tenant id). No organization, no access.
 * 2. Exchanges the caller's token (RFC 8693) for a management-API token scoped
 *    to that organization. The exchange re-checks membership and derives the
 *    permissions from the caller's roles in the organization.
 * 3. Dispatches in-process to `/api/v2` with a `tenant-id` header, so the
 *    management API's own auth, validation, hooks, logging and tenant
 *    dispatch (e.g. WFP forwarding) all apply unchanged.
 *
 * The caller's own token is never forwarded to the management API.
 */
export function createToolApi(
  ctx: Context<{ Bindings: Bindings; Variables: Variables }>,
  app: FetchableApp,
  caller: McpCaller,
  config: McpConfig,
): ToolApi {
  let executionCtx: ExecutionContext | undefined;
  try {
    executionCtx = ctx.executionCtx;
  } catch {
    // Not available outside Workers (e.g. tests).
    executionCtx = undefined;
  }

  let organizations: Promise<Organization[]> | undefined;
  const loadOrganizations = () => {
    organizations ??= fetchAll<Organization>(
      (params) =>
        ctx.env.data.userOrganizations.listUserOrganizations(
          caller.controlPlaneTenantId,
          caller.userId,
          params,
        ),
      "organizations",
    );
    return organizations;
  };

  const findOrganization = async (tenantId: string) => {
    const wanted = tenantId.toLowerCase();
    const orgs = await loadOrganizations();
    const org = orgs.find((o) => o.name.toLowerCase() === wanted);
    if (!org) {
      throw new McpToolError(`No access to tenant "${tenantId}"`);
    }
    return org;
  };

  const exchangeTokens = new Map<string, Promise<string>>();

  const exchange = async (org: Organization): Promise<string> => {
    const client = await ctx.env.data.clients.get(
      caller.controlPlaneTenantId,
      config.exchangeClientId,
    );
    if (!client?.client_secret) {
      throw new Error(
        `MCP exchange client "${config.exchangeClientId}" is missing or has no client_secret`,
      );
    }

    const tokenUrl = new URL("oauth/token", caller.controlPlaneIssuer);
    const headers = new Headers({
      "content-type": "application/x-www-form-urlencoded",
    });
    // The exchange compares the subject token's `iss` byte-exactly against
    // the issuer the token endpoint resolves from the request. On the default
    // issuer the tenant comes from the header; on a control-plane subdomain or
    // custom domain it must come from the host, which also sets that issuer.
    if (caller.controlPlaneIssuer === ctx.env.ISSUER) {
      headers.set("tenant-id", caller.controlPlaneTenantId);
    } else {
      headers.set("x-forwarded-host", tokenUrl.host);
    }

    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
      subject_token: caller.subjectToken,
      subject_token_type: ACCESS_TOKEN_TYPE,
      client_id: client.client_id,
      client_secret: client.client_secret,
      organization: org.id,
      audience: MANAGEMENT_API_AUDIENCE,
    });

    const response = await app.fetch(
      new Request(tokenUrl, { method: "POST", headers, body }),
      ctx.env,
      executionCtx,
    );
    const json: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      if (response.status === 403) {
        throw new McpToolError(`No access to tenant "${org.name}"`);
      }
      console.error("MCP token exchange failed", response.status, json);
      throw new McpToolError(
        `Could not authorize access to tenant "${org.name}" (token exchange failed with status ${response.status})`,
      );
    }
    if (!isRecord(json) || typeof json.access_token !== "string") {
      throw new Error("Token exchange returned no access_token");
    }
    return json.access_token;
  };

  const tokenFor = (org: Organization) => {
    let token = exchangeTokens.get(org.id);
    if (!token) {
      token = exchange(org);
      exchangeTokens.set(org.id, token);
    }
    return token;
  };

  return {
    pinnedTenantId: caller.pinnedTenantId,

    async listTenants() {
      const orgs = await loadOrganizations();
      return orgs.map((org) => ({
        tenant_id: org.name,
        display_name: org.display_name,
      }));
    },

    tenantFor(args) {
      if (caller.pinnedTenantId) return caller.pinnedTenantId;
      const tenantId = args.tenant_id;
      if (typeof tenantId !== "string" || !tenantId) {
        throw new McpToolError("Missing required argument: tenant_id");
      }
      return tenantId;
    },

    async management(tenantId, request) {
      const org = await findOrganization(tenantId);
      const token = await tokenFor(org);

      const url = new URL(`/api/v2${request.path}`, ctx.req.url);
      for (const [key, value] of Object.entries(request.query ?? {})) {
        if (value !== undefined && value !== "") {
          url.searchParams.set(key, value);
        }
      }

      const response = await app.fetch(
        new Request(url, {
          method: request.method ?? "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${token}`,
            "tenant-id": org.name,
          },
        }),
        ctx.env,
        executionCtx,
      );

      const text = await response.text();
      let data: unknown = text;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          // Keep the raw text.
        }
      }

      if (!response.ok) {
        const message =
          isRecord(data) && typeof data.message === "string"
            ? data.message
            : typeof data === "string" && data
              ? data
              : "Request failed";
        throw new McpToolError(`${response.status}: ${message}`);
      }
      return data;
    },
  };
}
