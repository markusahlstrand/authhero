import { Hono } from "hono";
import {
  customDomainCertificateUploadSchema,
  customDomainInsertSchema,
  CustomDomainsAdapter,
  customDomainUpdateSchema,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { Bindings } from "../../types";

// `tenant_id` is accepted for readability of the wire format, but it is NEVER
// what the handler acts on: the tenant is taken from the verified token and a
// mismatch is refused. A shard holding this scope must not be able to touch
// another tenant's domains by naming it.
const tenantIdField = { tenant_id: z.string().optional() };

const createBodySchema = customDomainInsertSchema.extend(tenantIdField);

// Only the fields Auth0 lets you change. A permissive `Partial<CustomDomain>`
// would let a caller move `domain` to a hostname it doesn't own (bypassing both
// the uniqueness check and Cloudflare registration) or forge lifecycle state
// like `status: "ready"` / `verification`.
const updateBodySchema = customDomainUpdateSchema.extend(tenantIdField);

const certificateBodySchema =
  customDomainCertificateUploadSchema.extend(tenantIdField);

/**
 * Cloudflare rejects a hostname that already exists in the zone (error 1406,
 * "Duplicate custom hostname found"). That means the control-plane DB and the
 * zone have drifted — treat it as the same conflict a cross-tenant claim
 * produces rather than a 500, so the caller gets one coherent answer.
 */
function isHostnameConflict(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes("1406") ||
    /already exists|duplicate custom hostname/i.test(message)
  );
}

function conflictBody(domain: string) {
  return {
    error: "conflict",
    message: `The custom domain "${domain}" is already registered`,
  };
}

export type AuthenticateControlPlane = (c: {
  req: { raw: Request; header(name: string): string | undefined; url: string };
  env: Bindings;
}) => Promise<{ ok: true; tenantId?: string } | { ok: false; reason: string }>;

export interface CustomDomainsControlPlaneOptions {
  /**
   * The authoritative adapter. On the control plane this is the Cloudflare
   * adapter (`@authhero/cloudflare-adapter`) wrapping the control-plane
   * database, so a write both registers the hostname in the CF-for-SaaS zone
   * and persists the row where the account credentials live.
   */
  customDomains: CustomDomainsAdapter;
  authenticate: AuthenticateControlPlane;
}

type TenantVars = { tenantId: string };

/**
 * The authoritative `custom-domains` resource. Tenant shards reach it through
 * `createControlPlaneCustomDomainsAdapter`; it is the only place that can both
 * see every tenant's domains (so `login.acme.com` can be claimed exactly once)
 * and hold the Cloudflare account credentials needed to register the hostname.
 *
 * Every operation is bound to the `tenant_id` claim of the verified token. The
 * scope alone is not authorization: each shard holds it, so a request-supplied
 * tenant id would let any shard read or delete any other tenant's domains.
 */
export function createCustomDomainsControlPlaneApp(
  options: CustomDomainsControlPlaneOptions,
): Hono<{ Bindings: Bindings; Variables: TenantVars }> {
  const app = new Hono<{ Bindings: Bindings; Variables: TenantVars }>();
  const { customDomains, authenticate } = options;

  app.use("*", async (c, next) => {
    const result = await authenticate(c);
    if (!result.ok) {
      console.warn(
        `[proxy/control-plane/custom-domains] authentication failed: ${result.reason}`,
      );
      return c.text("Unauthorized", 401, { "WWW-Authenticate": "Bearer" });
    }

    // Fail closed: a token with no tenant binding (e.g. a bare proxy
    // client-credentials token) cannot act on a tenant's domains at all.
    if (!result.tenantId) {
      console.warn(
        "[proxy/control-plane/custom-domains] token carries no tenant_id claim",
      );
      return c.text("Forbidden", 403);
    }

    c.set("tenantId", result.tenantId);
    return next();
  });

  /**
   * Refuse a request that names a tenant other than the one it authenticated
   * as, instead of silently acting on the authenticated tenant — a caller that
   * asked for tenant B must not believe it got tenant B's data back.
   */
  function claimedTenantMismatch(
    tenantId: string,
    claimed: string | undefined,
  ): boolean {
    return claimed !== undefined && claimed !== tenantId;
  }

  app.post("/", async (c) => {
    const tenantId = c.get("tenantId");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON", 400);
    }

    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid_request", details: parsed.error.issues },
        400,
      );
    }

    const { tenant_id: claimed, ...insert } = parsed.data;
    if (claimedTenantMismatch(tenantId, claimed))
      return c.text("Forbidden", 403);

    // Hostnames are case-insensitive, but the uniqueness lookup and the
    // resolution path (`getByDomain`) both match exactly. Canonicalize to
    // lower-case so `Login.acme.com` and `login.acme.com` resolve to the one
    // record — otherwise a differently-cased create dodges the same-tenant
    // idempotent-return and stores a row that never routes.
    const domain = insert.domain.toLowerCase();

    // Cross-tenant uniqueness — the reason this resource has to live above the
    // shards. Only the control plane can see that another tenant already owns
    // the hostname.
    const existing = await customDomains.getByDomain(domain);
    if (existing) {
      if (existing.tenant_id !== tenantId) {
        return c.json(conflictBody(domain), 409);
      }
      // Same tenant: idempotent re-create (a retried request, or a shard whose
      // mirror was lost) returns the record it already owns.
      const { tenant_id: _tenantId, ...owned } = existing;
      return c.json(owned, 200);
    }

    try {
      const created = await customDomains.create(tenantId, {
        ...insert,
        domain,
      });
      return c.json(created, 201);
    } catch (err) {
      if (isHostnameConflict(err)) {
        return c.json(conflictBody(domain), 409);
      }
      throw err;
    }
  });

  app.get("/", async (c) => {
    const tenantId = c.get("tenantId");
    if (claimedTenantMismatch(tenantId, c.req.query("tenant_id"))) {
      return c.text("Forbidden", 403);
    }

    return c.json(await customDomains.list(tenantId));
  });

  app.get("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    if (claimedTenantMismatch(tenantId, c.req.query("tenant_id"))) {
      return c.text("Forbidden", 403);
    }

    const domain = await customDomains.get(tenantId, c.req.param("id"));
    if (!domain) return c.text("Not found", 404);

    return c.json(domain);
  });

  app.patch("/:id", async (c) => {
    const tenantId = c.get("tenantId");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON", 400);
    }

    const parsed = updateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid_request", details: parsed.error.issues },
        400,
      );
    }

    const { tenant_id: claimed, ...update } = parsed.data;
    if (claimedTenantMismatch(tenantId, claimed))
      return c.text("Forbidden", 403);

    const id = c.req.param("id");
    const updated = await customDomains.update(tenantId, id, update);
    if (!updated) return c.text("Not found", 404);

    const domain = await customDomains.get(tenantId, id);
    if (!domain) return c.text("Not found", 404);

    return c.json(domain);
  });

  app.delete("/:id", async (c) => {
    const tenantId = c.get("tenantId");
    if (claimedTenantMismatch(tenantId, c.req.query("tenant_id"))) {
      return c.text("Forbidden", 403);
    }

    const removed = await customDomains.remove(tenantId, c.req.param("id"));
    if (!removed) return c.text("Not found", 404);

    return c.body(null, 204);
  });

  app.put("/:id/certificate", async (c) => {
    const tenantId = c.get("tenantId");

    const { uploadCertificate } = customDomains;
    if (!uploadCertificate) {
      return c.json(
        {
          error: "not_implemented",
          message:
            "The control-plane custom-domain adapter does not support certificate upload",
        },
        501,
      );
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.text("Invalid JSON", 400);
    }

    const parsed = certificateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "invalid_request", details: parsed.error.issues },
        400,
      );
    }

    const { tenant_id: claimed, ...cert } = parsed.data;
    if (claimedTenantMismatch(tenantId, claimed))
      return c.text("Forbidden", 403);

    const domain = await uploadCertificate(tenantId, c.req.param("id"), cert);
    return c.json(domain);
  });

  return app;
}
