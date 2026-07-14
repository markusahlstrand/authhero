import { Hono } from "hono";
import {
  CustomDomain,
  customDomainCertificateUploadSchema,
  customDomainInsertSchema,
  customDomainSchema,
  CustomDomainsAdapter,
} from "@authhero/adapter-interfaces";
import { z } from "@hono/zod-openapi";
import { Bindings } from "../../types";

const createBodySchema = customDomainInsertSchema.extend({
  tenant_id: z.string(),
});

// The tenant-side adapter forwards whatever `Partial<CustomDomain>` the
// management API handed it, so accept the full shape partially rather than the
// narrow Auth0 update schema.
const updateBodySchema = customDomainSchema.partial().extend({
  tenant_id: z.string(),
});

const certificateBodySchema = customDomainCertificateUploadSchema.extend({
  tenant_id: z.string(),
});

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
}) => Promise<{ ok: true } | { ok: false; reason: string }>;

export interface CustomDomainsControlPlaneOptions {
  /**
   * The authoritative adapter. On the control plane this is the Cloudflare
   * adapter (`@authhero/cloudflare`) wrapping the control-plane database, so a
   * write both registers the hostname in the CF-for-SaaS zone and persists the
   * row where the account credentials live.
   */
  customDomains: CustomDomainsAdapter;
  authenticate: AuthenticateControlPlane;
}

/**
 * The authoritative `custom-domains` resource. Tenant shards reach it through
 * `createControlPlaneCustomDomainsAdapter`; it is the only place that can both
 * see every tenant's domains (so `login.acme.com` can be claimed exactly once)
 * and hold the Cloudflare account credentials needed to register the hostname.
 */
export function createCustomDomainsControlPlaneApp(
  options: CustomDomainsControlPlaneOptions,
): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  const { customDomains, authenticate } = options;

  app.use("*", async (c, next) => {
    const result = await authenticate(c);
    if (!result.ok) {
      console.warn(
        `[proxy/control-plane/custom-domains] authentication failed: ${result.reason}`,
      );
      return c.text("Unauthorized", 401, { "WWW-Authenticate": "Bearer" });
    }
    return next();
  });

  async function readBody(c: {
    req: { json(): Promise<unknown> };
  }): Promise<unknown> {
    return c.req.json();
  }

  app.post("/", async (c) => {
    let body: unknown;
    try {
      body = await readBody(c);
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

    const { tenant_id, ...insert } = parsed.data;

    // Cross-tenant uniqueness — the reason this resource has to live above the
    // shards. Only the control plane can see that another tenant already owns
    // the hostname.
    const existing = await customDomains.getByDomain(insert.domain);
    if (existing) {
      if (existing.tenant_id !== tenant_id) {
        return c.json(conflictBody(insert.domain), 409);
      }
      // Same tenant: idempotent re-create (a retried request, or a shard whose
      // mirror was lost) returns the record it already owns.
      const { tenant_id: _tenantId, ...domain } = existing;
      return c.json(domain satisfies CustomDomain, 200);
    }

    try {
      const created = await customDomains.create(tenant_id, insert);
      return c.json(created, 201);
    } catch (err) {
      if (isHostnameConflict(err)) {
        return c.json(conflictBody(insert.domain), 409);
      }
      throw err;
    }
  });

  app.get("/", async (c) => {
    const tenantId = c.req.query("tenant_id");
    if (!tenantId) return c.text("Missing tenant_id", 400);

    const domains = await customDomains.list(tenantId);
    return c.json(domains);
  });

  app.get("/:id", async (c) => {
    const tenantId = c.req.query("tenant_id");
    if (!tenantId) return c.text("Missing tenant_id", 400);

    const domain = await customDomains.get(tenantId, c.req.param("id"));
    if (!domain) return c.text("Not found", 404);

    return c.json(domain);
  });

  app.patch("/:id", async (c) => {
    let body: unknown;
    try {
      body = await readBody(c);
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

    const { tenant_id, ...update } = parsed.data;
    const id = c.req.param("id");

    const updated = await customDomains.update(tenant_id, id, update);
    if (!updated) return c.text("Not found", 404);

    const domain = await customDomains.get(tenant_id, id);
    if (!domain) return c.text("Not found", 404);

    return c.json(domain);
  });

  app.delete("/:id", async (c) => {
    const tenantId = c.req.query("tenant_id");
    if (!tenantId) return c.text("Missing tenant_id", 400);

    const removed = await customDomains.remove(tenantId, c.req.param("id"));
    if (!removed) return c.text("Not found", 404);

    return c.body(null, 204);
  });

  app.put("/:id/certificate", async (c) => {
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
      body = await readBody(c);
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

    const { tenant_id, ...cert } = parsed.data;
    const domain = await uploadCertificate(tenant_id, c.req.param("id"), cert);
    return c.json(domain);
  });

  return app;
}
