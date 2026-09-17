import { Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { Bindings, McpConfig, Variables } from "../../types";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { tenantMiddleware } from "../../middlewares/tenant";
import { extractBearerToken } from "../../utils/auth-header";
import { validateJwtToken } from "../../utils/jwt";
import { createToolApi, type FetchableApp, type McpCaller } from "./dispatch";
import { handleMcpBody, rpcError } from "./protocol";
import { buildInstructions, buildTools } from "./tools";

type McpEnv = { Bindings: Bindings; Variables: Variables };
type McpContext = Context<McpEnv>;

const MCP_PATH = "/mcp";
const METADATA_PATH = "/.well-known/oauth-protected-resource";

interface Mode {
  controlPlaneTenantId: string;
  controlPlaneIssuer: string;
  /** Set when the request arrived on a tenant's own host. */
  pinnedTenantId?: string;
}

function resolveMode(ctx: McpContext, config: McpConfig): Mode {
  const controlPlaneTenantId =
    ctx.env.data.multiTenancyConfig?.controlPlaneTenantId;
  if (!controlPlaneTenantId) {
    throw new JSONHTTPException(500, {
      message: "The MCP endpoint requires a configured control plane",
    });
  }
  const hostTenantId = ctx.var.tenant_id;
  return {
    controlPlaneTenantId,
    controlPlaneIssuer: config.controlPlaneIssuer ?? ctx.env.ISSUER,
    pinnedTenantId:
      hostTenantId && hostTenantId !== controlPlaneTenantId
        ? hostTenantId
        : undefined,
  };
}

/** The public origin the client used, so `resource` matches what it called. */
function publicOrigin(ctx: McpContext): string {
  const requestUrl = new URL(ctx.req.url);
  const forwardedHost = ctx.req.header("x-forwarded-host");
  if (forwardedHost) return `https://${forwardedHost}`;
  const host = ctx.req.header("host") ?? requestUrl.host;
  return `${requestUrl.protocol}//${host}`;
}

function unauthorized(ctx: McpContext, error?: "invalid_token") {
  const parts = [
    `resource_metadata="${publicOrigin(ctx)}${METADATA_PATH}${MCP_PATH}"`,
  ];
  if (error) parts.unshift(`error="${error}"`);
  ctx.header("WWW-Authenticate", `Bearer ${parts.join(", ")}`);
  return ctx.json({ error: error ?? "unauthorized" }, 401);
}

/**
 * Remote MCP server for the Management API.
 *
 * - `POST /mcp` — JSON-RPC tool endpoint, bearer-protected.
 * - `GET /.well-known/oauth-protected-resource[/mcp]` — RFC 9728 metadata
 *   naming the control-plane issuer as the authorization server.
 *
 * Tokens are always issued by the control-plane tenant. On the control-plane
 * host the tools take a `tenant_id`; on a tenant's own host (subdomain or
 * custom domain, or a proxy forwarding one via `x-forwarded-host`) they are
 * pinned to that tenant. Access is enforced per call in `dispatch.ts`.
 */
export function createMcpApp(config: McpConfig, app: FetchableApp) {
  const mcp = new Hono<McpEnv>();

  // Bearer tokens travel in a header, never cookies, so any origin may call.
  const corsMiddleware = cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: [
      "authorization",
      "content-type",
      "mcp-protocol-version",
      "mcp-session-id",
    ],
    exposeHeaders: ["www-authenticate"],
  });

  // Registered per path: this app is mounted at the root, where a wildcard
  // middleware would run for every other route too.
  for (const path of [MCP_PATH, METADATA_PATH, `${METADATA_PATH}${MCP_PATH}`]) {
    mcp.use(path, corsMiddleware, tenantMiddleware);
  }

  const metadata = (ctx: McpContext) => {
    const mode = resolveMode(ctx, config);
    return ctx.json({
      resource: `${publicOrigin(ctx)}${MCP_PATH}`,
      authorization_servers: [mode.controlPlaneIssuer],
      bearer_methods_supported: ["header"],
      scopes_supported: ["openid", "profile", "email", "offline_access"],
      resource_name: mode.pinnedTenantId
        ? `AuthHero Management API (${mode.pinnedTenantId})`
        : "AuthHero Management API",
    });
  };
  mcp.get(METADATA_PATH, metadata);
  mcp.get(`${METADATA_PATH}${MCP_PATH}`, metadata);

  mcp.post(MCP_PATH, async (ctx) => {
    const mode = resolveMode(ctx, config);

    const subjectToken = extractBearerToken(ctx.req.header("authorization"));
    if (!subjectToken) return unauthorized(ctx);

    let payload;
    try {
      // Verify against the control-plane keyset whichever host this is, and
      // pin the issuer ourselves (byte-exact).
      payload = await validateJwtToken(ctx, subjectToken, {
        tenantId: mode.controlPlaneTenantId,
        skipIssuerCheck: true,
      });
    } catch (err) {
      if (err instanceof HTTPException)
        return unauthorized(ctx, "invalid_token");
      throw err;
    }
    // Delegated (already exchanged) tokens are not accepted as a subject.
    if (
      payload.iss !== mode.controlPlaneIssuer ||
      !payload.sub ||
      payload.act !== undefined
    ) {
      return unauthorized(ctx, "invalid_token");
    }

    let body: unknown;
    try {
      body = await ctx.req.json();
    } catch {
      return ctx.json(rpcError(null, -32700, "Parse error"), 400);
    }

    const caller: McpCaller = {
      subjectToken,
      userId: payload.sub,
      controlPlaneTenantId: mode.controlPlaneTenantId,
      controlPlaneIssuer: mode.controlPlaneIssuer,
      pinnedTenantId: mode.pinnedTenantId,
    };

    const result = await handleMcpBody(
      {
        api: createToolApi(ctx, app, caller, config),
        tools: buildTools(mode.pinnedTenantId),
        instructions: buildInstructions(mode.pinnedTenantId),
      },
      body,
    );

    if (!result) return ctx.body(null, 202);
    return ctx.json(result);
  });

  // Stateless server: no SSE stream to open and no session to delete.
  mcp.on(["GET", "DELETE"], MCP_PATH, (ctx) => {
    ctx.header("Allow", "POST");
    return ctx.json({ error: "method_not_allowed" }, 405);
  });

  return mcp;
}
