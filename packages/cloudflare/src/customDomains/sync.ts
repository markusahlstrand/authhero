import { CloudflareConfig } from "../types/CloudflareConfig";
import { customDomainListResponseSchema } from "../types/CustomDomain";
import { getClient, refreshFromCloudflare } from "./index";

export interface SyncCustomDomainsOptions {
  /**
   * Hostnames fetched per Cloudflare API call. The API caps this at 50, which
   * is also the default — one page covers 50 domains in a single request.
   */
  perPage?: number;
  /**
   * Safety stop, in pages. A zone larger than `perPage * maxPages` is swept
   * partially rather than looping forever on a paginating API that never
   * reports a short page. Default 200 (10 000 hostnames at the default size).
   */
  maxPages?: number;
}

export interface SyncCustomDomainsResult {
  /** Hostnames returned by Cloudflare across every page. */
  scanned: number;
  /** Hostnames that matched a stored custom-domain row. */
  matched: number;
  /** Rows whose `status` or `verification` actually changed. */
  updated: number;
  /**
   * Hostnames in the zone with no stored row. Expected to be 0 in a zone
   * AuthHero owns exclusively; a non-zero count means either a hostname
   * registered outside AuthHero or a `create` that died between the Cloudflare
   * call and the DB write.
   */
  unknown: number;
  /**
   * Stored rows whose `custom_domain_id` no longer matches the hostname's id
   * at the edge — the hostname was deleted and re-registered behind our back.
   * Left untouched: adopting the new id would rewrite a primary key that
   * `proxy_routes` and the KV host blobs point at.
   */
  mismatched: number;
  /** Hostnames that threw while being reconciled. Each one is logged. */
  errors: number;
}

/**
 * Reconcile every custom hostname in the Cloudflare zone against the stored
 * custom-domain rows.
 *
 * Without this, `status` and `verification` only ever refresh when someone
 * reads a single domain by id (`get()`): `list()` and `getByDomain()` are
 * deliberately DB-only so they stay fast and survive a Cloudflare outage. A
 * hostname that finishes validation at the edge therefore stays `pending` in
 * the database until a human happens to open its detail page. This closes that
 * gap on a schedule.
 *
 * Enumerates Cloudflare-first — one paginated list call per 50 hostnames,
 * rather than one request per stored domain — then resolves each hostname's
 * tenant through `getByDomain`, which every adapter indexes because it is the
 * request-routing path.
 *
 * One hostname's failure never aborts the sweep, and the result is returned
 * rather than thrown: a cron that dies halfway leaves the rest of the zone
 * stale until the next run.
 *
 * Deletion is deliberately out of scope. A hostname removed at the edge simply
 * stops appearing in the listing, and "absent from a page I may have failed to
 * fetch" is not evidence a domain is gone — removals go through `remove()`.
 *
 * @example
 * ```ts
 * export default {
 *   async scheduled(event, env) {
 *     const config = buildCloudflareConfig(env);
 *     console.log("custom domain sync", await syncCustomDomains(config));
 *   },
 * };
 * ```
 */
export async function syncCustomDomains(
  config: CloudflareConfig,
  options: SyncCustomDomainsOptions = {},
): Promise<SyncCustomDomainsResult> {
  const perPage = options.perPage ?? 50;
  const maxPages = options.maxPages ?? 200;

  const result: SyncCustomDomainsResult = {
    scanned: 0,
    matched: 0,
    updated: 0,
    unknown: 0,
    mismatched: 0,
    errors: 0,
  };

  for (let page = 1; page <= maxPages; page++) {
    let body: unknown;
    try {
      body = await getClient(config)
        .get(`/custom_hostnames?page=${page}&per_page=${perPage}`)
        .json();
    } catch (err) {
      console.warn(
        `[custom-domains] sync failed to list page ${page} of zone ${config.zoneId}; stopping the sweep:`,
        err instanceof Error ? err.message : err,
      );
      result.errors++;
      return result;
    }

    const parsed = customDomainListResponseSchema.safeParse(body);
    if (!parsed.success || !parsed.data.success) {
      console.warn(
        `[custom-domains] sync got an unparseable listing for page ${page} of zone ${config.zoneId}; stopping the sweep.`,
        parsed.success
          ? { cfErrors: parsed.data.errors }
          : { zodIssues: parsed.error.issues },
      );
      result.errors++;
      return result;
    }

    const hostnames = parsed.data.result;

    for (const hostname of hostnames) {
      result.scanned++;
      try {
        const stored = await config.customDomainAdapter.getByDomain(
          hostname.hostname,
        );
        if (!stored) {
          result.unknown++;
          continue;
        }

        // Enterprise zones stamp the owning tenant onto the hostname. Where
        // that is knowable, a disagreement between the edge and the database
        // means one of them is about the wrong tenant — refuse to write either
        // way rather than mirroring state across a tenant boundary.
        if (
          config.enterprise &&
          hostname.custom_metadata?.tenant_id !== stored.tenant_id
        ) {
          console.warn(
            `[custom-domains] sync skipping ${hostname.hostname}: zone says tenant=${hostname.custom_metadata?.tenant_id}, database says tenant=${stored.tenant_id}.`,
          );
          result.mismatched++;
          continue;
        }

        if (stored.custom_domain_id !== hostname.id) {
          console.warn(
            `[custom-domains] sync skipping ${hostname.hostname} (tenant=${stored.tenant_id}): stored id ${stored.custom_domain_id} no longer matches the zone's ${hostname.id}.`,
          );
          result.mismatched++;
          continue;
        }

        result.matched++;
        const { changed } = await refreshFromCloudflare(
          config,
          stored.tenant_id,
          stored,
          hostname,
        );
        if (changed) {
          result.updated++;
        }
      } catch (err) {
        console.warn(
          `[custom-domains] sync failed for ${hostname.hostname}:`,
          err instanceof Error ? err.message : err,
        );
        result.errors++;
      }
    }

    // A short page is the last page. Cloudflare reports `result_info`, but
    // trusting the page size needs no extra schema and behaves the same.
    if (hostnames.length < perPage) {
      return result;
    }
  }

  console.warn(
    `[custom-domains] sync hit the ${maxPages}-page limit for zone ${config.zoneId}; the tail of the zone was not swept.`,
  );
  return result;
}
