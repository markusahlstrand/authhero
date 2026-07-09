import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../../types";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { validateConnectOrigin } from "../../helpers/dcr/validate-connect-origin";
import { isInteractiveClient } from "../../helpers/provision-tenant-clients";

import { defineRoute } from "../../utils/define-route";
const UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS = 60 * 30; // 30 min

const connectStartQuerySchema = z.object({
  integration_type: z.string().min(1).optional().openapi({
    description:
      "Optional caller-defined integration label. Surfaced on the consent screen and stored on the resulting client's IAT constraints. No validation beyond non-empty string.",
  }),
  domain: z.string().min(1).openapi({
    description:
      "The domain that will host the integration (origin must match return_to)",
  }),
  return_to: z.string().url().openapi({
    description:
      "Where the browser is redirected after consent (success or cancel)",
  }),
  state: z.string().min(1).openapi({
    description: "Caller-supplied CSRF token round-tripped on the redirect",
  }),
  scope: z.string().optional().openapi({
    description: "Optional space-separated scope list pre-bound to the IAT",
  }),
  audience: z.string().optional().openapi({
    description:
      "Optional API identifier the registered client should be granted access to. When set, the resulting client receives a `client_grants` row binding (client_id, audience, scope[]) so it can mint access tokens for that API via client_credentials.",
  }),
});
const getRoot = defineRoute({
  route: createRoute({
    tags: ["connect"],
    method: "get",
    path: "/",
    request: {
      query: connectStartQuerySchema,
    },
    responses: {
      302: {
        description:
          "Redirect to /u2/connect/start with a fresh login_session id",
        headers: z.object({ Location: z.string() }),
      },
      400: {
        description: "Invalid request",
        content: { "application/json": { schema: z.object({}) } },
      },
      404: {
        description: "DCR / consent flow not enabled for this tenant",
        content: { "application/json": { schema: z.object({}) } },
      },
    },
  }),
  handler: async (ctx) => {
    const tenant_id = ctx.var.tenant_id;
    const tenant = await ctx.env.data.tenants.get(tenant_id);
    if (!tenant) {
      throw new JSONHTTPException(404, {
        error: "invalid_request",
        error_description: "Tenant not found",
      });
    }
    if (!tenant.flags?.enable_dynamic_client_registration) {
      throw new JSONHTTPException(404, {
        error: "invalid_request",
        error_description: "Dynamic Client Registration is not enabled",
      });
    }

    const { integration_type, domain, return_to, state, scope, audience } =
      ctx.req.valid("query");

    // Resolve audience -> resource server (if provided) and validate the
    // requested scopes are a subset of what the API actually defines. This
    // keeps a malicious caller from bouncing the user through a consent
    // screen that promises scopes the API will never honor.
    if (audience) {
      const { resource_servers } =
        await ctx.env.data.resourceServers.list(tenant_id);
      const resourceServer = resource_servers.find(
        (rs) => rs.identifier === audience,
      );
      if (!resourceServer) {
        throw new JSONHTTPException(400, {
          error: "invalid_request",
          error_description: `Unknown audience: ${audience}`,
        });
      }
      if (scope) {
        const definedScopes = new Set(
          (resourceServer.scopes ?? []).map((s) => s.value),
        );
        const requested = scope.split(/\s+/).filter(Boolean);
        const unknown = requested.filter((s) => !definedScopes.has(s));
        if (unknown.length > 0) {
          throw new JSONHTTPException(400, {
            error: "invalid_scope",
            error_description: `Scope(s) not defined on the resource server: ${unknown.join(", ")}`,
          });
        }
      }
    } else if (scope) {
      // Without an audience we can't validate scope ownership — keep the
      // request shape strict so callers don't end up with an IAT carrying
      // un-grantable scopes.
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "scope requires audience",
      });
    }

    const allowHttp = tenant.flags?.allow_http_return_to ?? [];
    // `domain` accepts either a bare host[:port] (legacy, implicit https) or a
    // full origin like `http://127.0.0.1:8888` for non-https local-dev cases.
    const domainRaw = /^https?:\/\//i.test(domain)
      ? domain
      : `https://${domain}`;
    const domainCheck = validateConnectOrigin(domainRaw, allowHttp);
    if (!domainCheck.ok) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: `domain: ${domainCheck.reason}`,
      });
    }
    const returnCheck = validateConnectOrigin(return_to, allowHttp);
    if (!returnCheck.ok) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: `return_to: ${returnCheck.reason}`,
      });
    }
    if (returnCheck.origin !== domainCheck.origin) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "return_to origin must match domain",
      });
    }

    // Anchor the login_session to a tenant client. The session is only used
    // to carry consent state through the login bounce; the anchor client_id
    // is never traversed in an OAuth flow. Prefer the tenant's configured
    // `default_client_id` (analogous to Auth0's Default App) so branding
    // stays deterministic, and fall back to the first *interactive* client so
    // a brand-new tenant can still bootstrap its first DCR integration — never
    // an M2M/client_credentials client, which can't render a login screen.
    let anchorClient = tenant.default_client_id
      ? await ctx.env.data.clients.get(tenant_id, tenant.default_client_id)
      : null;
    if (!anchorClient) {
      // Page through the tenant's clients — the list adapter defaults to the
      // first 50 rows, so an interactive client could sit on a later page.
      const perPage = 100;
      for (let page = 0; !anchorClient; page++) {
        const { clients } = await ctx.env.data.clients.list(tenant_id, {
          page,
          per_page: perPage,
        });
        anchorClient = clients.find(isInteractiveClient) ?? null;
        if (clients.length < perPage) {
          break;
        }
      }
    }
    if (!anchorClient) {
      throw new JSONHTTPException(400, {
        error: "invalid_request",
        error_description: "No clients configured for this tenant",
      });
    }

    const expiresAt = new Date(
      Date.now() + UNIVERSAL_AUTH_SESSION_EXPIRES_IN_SECONDS * 1000,
    ).toISOString();

    const loginSession = await ctx.env.data.loginSessions.create(tenant_id, {
      expires_at: expiresAt,
      authParams: {
        client_id: anchorClient.client_id,
        state,
      },
      csrf_token: nanoid(),
      ip: ctx.var.ip,
      useragent: ctx.var.useragent,
      state_data: JSON.stringify({
        connect: {
          integration_type,
          domain,
          return_to,
          scope,
          audience,
          caller_state: state,
          is_local_dev: returnCheck.isLoopback || returnCheck.isAllowlisted,
        },
      }),
    });

    return ctx.redirect(
      `/u2/connect/start?state=${encodeURIComponent(loginSession.id)}`,
      302,
    );
  },
});

export const connectStartRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapiRoutes([getRoot] as const);
