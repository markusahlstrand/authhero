import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { nanoid } from "nanoid";
import { Bindings, Variables } from "../../types";
import { JSONHTTPException } from "../../errors/json-http-exception";
import { validateConnectOrigin } from "../../helpers/dcr/validate-connect-origin";

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
});

export const connectStartRoutes = new OpenAPIHono<{
  Bindings: Bindings;
  Variables: Variables;
}>().openapi(
  createRoute({
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
  async (ctx) => {
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

    const { integration_type, domain, return_to, state, scope } =
      ctx.req.valid("query");

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

    // Anchor the login_session to any existing tenant client. The session
    // is only used to carry consent state through login bounce; the anchor
    // client_id is never traversed in an OAuth flow.
    const { clients } = await ctx.env.data.clients.list(tenant_id);
    const anchorClient = clients[0];
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
);
