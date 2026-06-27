/**
 * Resolves the control-plane organization that represents a child tenant.
 *
 * Each child tenant is mirrored by an organization on the control-plane tenant
 * whose `name` equals the tenant id. Matching is case-insensitive and exact so
 * a tenant id like `acme` never resolves to a similarly-named `acme-staging`.
 */
export function findOrganizationForTenant<T extends { name?: string }>(
  organizations: readonly T[],
  tenantId: string,
): T | undefined {
  const target = tenantId.toLowerCase();
  return organizations.find((o) => (o.name ?? "").toLowerCase() === target);
}
