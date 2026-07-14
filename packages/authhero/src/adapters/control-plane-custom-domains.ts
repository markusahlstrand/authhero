import {
  CustomDomain,
  CustomDomainCertificateUpload,
  CustomDomainInsert,
  customDomainSchema,
  CustomDomainsAdapter,
  CustomDomainWithTenantId,
} from "@authhero/adapter-interfaces";
import { HTTPException } from "hono/http-exception";
import {
  ControlPlaneClient,
  ControlPlaneResponse,
} from "../helpers/control-plane-client";
import { CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE } from "../routes/proxy-control-plane/scopes";

export const CONTROL_PLANE_CUSTOM_DOMAINS_PATH =
  "/api/v2/proxy/control-plane/custom-domains";

export interface ControlPlaneCustomDomainsOptions {
  /** Authed transport to the control plane. */
  client: ControlPlaneClient;
  /**
   * Local read-cache for custom domains — normally the shard's own database
   * adapter (`database.customDomains`). The control plane owns the row; this
   * mirror exists so `getByDomain` (tenant resolution, a hot path) and `list`
   * don't need a network hop.
   */
  mirror: CustomDomainsAdapter;
  /** Override the control-plane resource path (tests, custom mounts). */
  basePath?: string;
}

function errorMessage(data: unknown, fallback: string): string {
  if (data !== null && typeof data === "object") {
    const body = data as { message?: unknown; error?: unknown };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  }
  return fallback;
}

/**
 * Map a non-2xx control-plane response onto an exception the management API
 * can surface. 4xx passes through with its status (so a 409 conflict stays a
 * 409 to the caller); anything else is a 502 — the tenant shard is fine, its
 * upstream is not.
 */
function toHttpException(
  response: ControlPlaneResponse,
  action: string,
): HTTPException {
  const message = errorMessage(
    response.data,
    `Control plane failed to ${action} (status ${response.status})`,
  );
  if (response.status >= 400 && response.status < 500) {
    return new HTTPException(response.status as 400, { message });
  }
  return new HTTPException(502, { message });
}

function parseCustomDomain(data: unknown, action: string): CustomDomain {
  const parsed = customDomainSchema.safeParse(data);
  if (!parsed.success) {
    throw new HTTPException(502, {
      message: `Control plane returned an unparseable custom domain on ${action}`,
    });
  }
  return parsed.data;
}

/**
 * A `CustomDomainsAdapter` for a tenant shard that cannot register hostnames
 * itself: a CF-for-SaaS custom hostname is an account-global resource in one
 * shared zone, and only the control plane holds the account credentials — and
 * only something above all shards can see that `login.acme.com` is already
 * claimed by another tenant.
 *
 * So the control plane is authoritative: writes go there synchronously and the
 * result is mirrored into the shard's own database as a read cache. On a
 * conflict nothing is written locally, which is what prevents the
 * half-provisioned, unroutable row this replaces.
 *
 * Reads trust the mirror once a domain is `ready`. A `pending` domain flips to
 * `ready` on Cloudflare's timeline (after the customer adds the DV record) and
 * that transition happens at the control plane, so a non-ready row is
 * refreshed from upstream on read. `getByDomain` always reads the mirror — it
 * is on the tenant-resolution path and must not take a network hop.
 */
export function createControlPlaneCustomDomainsAdapter(
  options: ControlPlaneCustomDomainsOptions,
): CustomDomainsAdapter {
  const { client, mirror } = options;
  const basePath = options.basePath ?? CONTROL_PLANE_CUSTOM_DOMAINS_PATH;
  const scope = CONTROL_PLANE_CUSTOM_DOMAINS_SCOPE;

  /**
   * Write the authoritative record into the local mirror. Failures are logged
   * and swallowed: the mirror is a cache, and the control plane has already
   * accepted the write — failing the request here would report an error for an
   * operation that actually succeeded.
   */
  async function mirrorUpsert(
    tenantId: string,
    domain: CustomDomain,
  ): Promise<void> {
    try {
      const updated = await mirror.update(
        tenantId,
        domain.custom_domain_id,
        domain,
      );
      if (updated) return;

      const insert: CustomDomainInsert = {
        domain: domain.domain,
        custom_domain_id: domain.custom_domain_id,
        type: domain.type,
        verification_method: domain.verification_method,
        tls_policy:
          domain.tls_policy === "recommended" ? "recommended" : undefined,
        custom_client_ip_header: domain.custom_client_ip_header,
        domain_metadata: domain.domain_metadata,
      };
      await mirror.create(tenantId, insert);
      // `CustomDomainInsert` carries no lifecycle state, so mirror the
      // control-plane-derived fields in a second write (same shape the
      // Cloudflare adapter uses).
      await mirror.update(tenantId, domain.custom_domain_id, {
        status: domain.status,
        primary: domain.primary,
        verification: domain.verification,
        origin_domain_name: domain.origin_domain_name,
      });
    } catch (err) {
      console.warn(
        `[control-plane/custom-domains] mirror write failed for ${domain.custom_domain_id} (tenant=${tenantId}); the control plane remains authoritative:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  async function mirrorRemove(tenantId: string, id: string): Promise<void> {
    try {
      await mirror.remove(tenantId, id);
    } catch (err) {
      console.warn(
        `[control-plane/custom-domains] mirror delete failed for ${id} (tenant=${tenantId}):`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return {
    create: async (
      tenantId: string,
      customDomain: CustomDomainInsert,
    ): Promise<CustomDomain> => {
      const response = await client.request({
        tenantId,
        scope,
        method: "POST",
        path: basePath,
        body: { tenant_id: tenantId, ...customDomain },
      });

      if (response.status !== 200 && response.status !== 201) {
        // 409 included: the domain is claimed by another tenant (or already
        // registered in the zone). Nothing is written to the mirror, so no
        // orphan row is left behind.
        throw toHttpException(response, "create the custom domain");
      }

      const created = parseCustomDomain(response.data, "create");
      await mirrorUpsert(tenantId, created);
      return created;
    },

    get: async (tenantId: string, id: string): Promise<CustomDomain | null> => {
      const cached = await mirror.get(tenantId, id);
      if (cached?.status === "ready") return cached;

      let response: ControlPlaneResponse;
      try {
        response = await client.request({
          tenantId,
          scope,
          method: "GET",
          path: `${basePath}/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(tenantId)}`,
        });
      } catch (err) {
        if (cached) {
          console.warn(
            `[control-plane/custom-domains] refresh failed for ${id} (tenant=${tenantId}); serving the stale mirror row:`,
            err instanceof Error ? err.message : err,
          );
          return cached;
        }
        throw err;
      }

      if (response.status === 404) {
        // Removed upstream (or by another shard) — drop the stale mirror row.
        if (cached) await mirrorRemove(tenantId, id);
        return null;
      }
      if (response.status !== 200) {
        if (cached) return cached;
        throw toHttpException(response, "read the custom domain");
      }

      const domain = parseCustomDomain(response.data, "get");
      await mirrorUpsert(tenantId, domain);
      return domain;
    },

    // Tenant resolution runs on every request for a custom domain, so this
    // never leaves the shard. The mirror is written on create/update/refresh.
    getByDomain: async (
      domain: string,
    ): Promise<CustomDomainWithTenantId | null> => mirror.getByDomain(domain),

    list: async (tenantId: string): Promise<CustomDomain[]> => {
      const cached = await mirror.list(tenantId);
      const stale =
        cached.length === 0 || cached.some((d) => d.status !== "ready");
      if (!stale) return cached;

      let response: ControlPlaneResponse;
      try {
        response = await client.request({
          tenantId,
          scope,
          method: "GET",
          path: `${basePath}?tenant_id=${encodeURIComponent(tenantId)}`,
        });
      } catch (err) {
        console.warn(
          `[control-plane/custom-domains] list refresh failed (tenant=${tenantId}); serving mirror rows:`,
          err instanceof Error ? err.message : err,
        );
        return cached;
      }

      if (response.status !== 200) {
        console.warn(
          `[control-plane/custom-domains] list refresh returned ${response.status} (tenant=${tenantId}); serving mirror rows.`,
        );
        return cached;
      }

      const parsed = customDomainSchema.array().safeParse(response.data);
      if (!parsed.success) {
        console.warn(
          `[control-plane/custom-domains] list refresh unparseable (tenant=${tenantId}); serving mirror rows.`,
        );
        return cached;
      }

      const fresh = parsed.data;
      const freshIds = new Set(fresh.map((d) => d.custom_domain_id));
      for (const row of cached) {
        if (!freshIds.has(row.custom_domain_id)) {
          await mirrorRemove(tenantId, row.custom_domain_id);
        }
      }
      for (const domain of fresh) {
        await mirrorUpsert(tenantId, domain);
      }
      return fresh;
    },

    update: async (
      tenantId: string,
      id: string,
      customDomain: Partial<CustomDomain>,
    ): Promise<boolean> => {
      const response = await client.request({
        tenantId,
        scope,
        method: "PATCH",
        path: `${basePath}/${encodeURIComponent(id)}`,
        body: { tenant_id: tenantId, ...customDomain },
      });

      if (response.status === 404) return false;
      if (response.status !== 200) {
        throw toHttpException(response, "update the custom domain");
      }

      const updated = parseCustomDomain(response.data, "update");
      await mirrorUpsert(tenantId, updated);
      return true;
    },

    remove: async (tenantId: string, id: string): Promise<boolean> => {
      const response = await client.request({
        tenantId,
        scope,
        method: "DELETE",
        path: `${basePath}/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(tenantId)}`,
      });

      if (response.status === 404) {
        // Already gone upstream; clear the mirror so the two agree.
        await mirrorRemove(tenantId, id);
        return false;
      }
      if (response.status !== 200 && response.status !== 204) {
        throw toHttpException(response, "delete the custom domain");
      }

      await mirrorRemove(tenantId, id);
      return true;
    },

    uploadCertificate: async (
      tenantId: string,
      id: string,
      cert: CustomDomainCertificateUpload,
    ): Promise<CustomDomain> => {
      const response = await client.request({
        tenantId,
        scope,
        method: "PUT",
        path: `${basePath}/${encodeURIComponent(id)}/certificate`,
        body: { tenant_id: tenantId, ...cert },
      });

      if (response.status !== 200) {
        throw toHttpException(response, "upload the certificate");
      }

      const domain = parseCustomDomain(response.data, "certificate upload");
      await mirrorUpsert(tenantId, domain);
      return domain;
    },
  };
}
