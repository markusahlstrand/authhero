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

  /** Write the authoritative record into the local mirror. */
  async function mirrorUpsert(
    tenantId: string,
    domain: CustomDomain,
  ): Promise<void> {
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
  }

  /**
   * Mirror a write that the control plane has already accepted.
   *
   * This must NOT swallow failures. `getByDomain` — the tenant-resolution path
   * — reads only the mirror, so a lost mirror write means a domain that the
   * control plane considers registered never routes on this shard (and a lost
   * mirror delete means a removed domain keeps routing). Surfacing the error
   * lets the caller retry, which is safe: a repeated create returns the record
   * the tenant already owns rather than registering a second hostname.
   */
  async function mirrorWriteOrThrow(
    tenantId: string,
    op: () => Promise<void>,
    what: string,
  ): Promise<void> {
    try {
      await op();
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(
        `[control-plane/custom-domains] mirror ${what} failed (tenant=${tenantId}); the control plane accepted the write but this shard cannot route it:`,
        detail,
      );
      throw new HTTPException(503, {
        message: `The custom domain was registered but could not be cached locally (${what}); retry the request. Detail: ${detail}`,
      });
    }
  }

  /**
   * Refresh the mirror from an authoritative read. Failures are logged and
   * swallowed here — unlike a write, the response we are about to return is
   * already correct, and the next read will try again.
   */
  async function mirrorRefresh(
    tenantId: string,
    op: () => Promise<void>,
    what: string,
  ): Promise<void> {
    try {
      await op();
    } catch (err) {
      console.warn(
        `[control-plane/custom-domains] mirror ${what} failed during refresh (tenant=${tenantId}):`,
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
      await mirrorWriteOrThrow(
        tenantId,
        () => mirrorUpsert(tenantId, created),
        "create",
      );
      return created;
    },

    get: async (tenantId: string, id: string): Promise<CustomDomain | null> => {
      // Always ask the owner. Trusting a `ready` mirror row forever would mean
      // a domain updated or deleted at the control plane never converges here.
      // This is a management read, not the routing path (`getByDomain`), so the
      // hop is affordable; the mirror is the fallback when the hop fails.
      let response: ControlPlaneResponse;
      try {
        response = await client.request({
          tenantId,
          scope,
          method: "GET",
          path: `${basePath}/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(tenantId)}`,
        });
      } catch (err) {
        const cached = await mirror.get(tenantId, id);
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
        // Removed upstream (or by another shard) — drop the stale mirror row so
        // it stops resolving here.
        await mirrorRefresh(
          tenantId,
          async () => {
            await mirror.remove(tenantId, id);
          },
          "delete",
        );
        return null;
      }
      if (response.status !== 200) {
        const cached = await mirror.get(tenantId, id);
        if (cached) return cached;
        throw toHttpException(response, "read the custom domain");
      }

      const domain = parseCustomDomain(response.data, "get");
      await mirrorRefresh(
        tenantId,
        () => mirrorUpsert(tenantId, domain),
        "upsert",
      );
      return domain;
    },

    // Tenant resolution runs on every request for a custom domain, so this
    // never leaves the shard. The mirror is written on create/update/refresh.
    getByDomain: async (
      domain: string,
    ): Promise<CustomDomainWithTenantId | null> => mirror.getByDomain(domain),

    list: async (tenantId: string): Promise<CustomDomain[]> => {
      // Same reasoning as `get`: the control plane owns these rows, so this is
      // where the mirror reconciles — including pruning rows that were removed
      // upstream. Falls back to the mirror when the control plane is
      // unreachable.
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
        return mirror.list(tenantId);
      }

      if (response.status !== 200) {
        console.warn(
          `[control-plane/custom-domains] list refresh returned ${response.status} (tenant=${tenantId}); serving mirror rows.`,
        );
        return mirror.list(tenantId);
      }

      const parsed = customDomainSchema.array().safeParse(response.data);
      if (!parsed.success) {
        console.warn(
          `[control-plane/custom-domains] list refresh unparseable (tenant=${tenantId}); serving mirror rows.`,
        );
        return mirror.list(tenantId);
      }

      const fresh = parsed.data;
      const freshIds = new Set(fresh.map((d) => d.custom_domain_id));
      const cached = await mirror.list(tenantId);

      await mirrorRefresh(
        tenantId,
        async () => {
          for (const row of cached) {
            if (!freshIds.has(row.custom_domain_id)) {
              await mirror.remove(tenantId, row.custom_domain_id);
            }
          }
          for (const domain of fresh) {
            await mirrorUpsert(tenantId, domain);
          }
        },
        "reconcile",
      );

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
      await mirrorWriteOrThrow(
        tenantId,
        () => mirrorUpsert(tenantId, updated),
        "update",
      );
      return true;
    },

    remove: async (tenantId: string, id: string): Promise<boolean> => {
      const response = await client.request({
        tenantId,
        scope,
        method: "DELETE",
        path: `${basePath}/${encodeURIComponent(id)}?tenant_id=${encodeURIComponent(tenantId)}`,
      });

      const gone = response.status === 404;
      if (!gone && response.status !== 200 && response.status !== 204) {
        throw toHttpException(response, "delete the custom domain");
      }

      // Deleted upstream (or already gone): the mirror MUST follow, or the
      // domain keeps resolving to this tenant via getByDomain.
      await mirrorWriteOrThrow(
        tenantId,
        async () => {
          await mirror.remove(tenantId, id);
        },
        "delete",
      );

      return !gone;
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
      await mirrorWriteOrThrow(
        tenantId,
        () => mirrorUpsert(tenantId, domain),
        "certificate upload",
      );
      return domain;
    },
  };
}
