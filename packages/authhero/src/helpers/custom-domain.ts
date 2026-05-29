import { Bindings } from "../types";

/**
 * Resolve the hostname of a tenant's usable custom domain, if one exists.
 *
 * Only domains whose verification has completed ("ready") can serve traffic,
 * so others are ignored. A primary domain wins over a non-primary one.
 */
export async function getTenantCustomDomain(
  env: Bindings,
  tenantId: string,
): Promise<string | undefined> {
  const domains = await env.data.customDomains.list(tenantId);
  const ready = domains.filter((d) => d.status === "ready");
  const chosen = ready.find((d) => d.primary) ?? ready[0];
  return chosen?.domain;
}
