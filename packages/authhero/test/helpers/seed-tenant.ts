import { DataAdapters } from "@authhero/adapter-interfaces";

/**
 * Fixtures for management-api specs that need a *second* tenant.
 *
 * `getTestServer` only seeds "tenantId", and the sessions/grants/refresh-token
 * tables carry foreign keys on `tenant_id` and `(user_id, tenant_id)`, so a
 * tenant-isolation case cannot just write rows under an arbitrary tenant id.
 */
export async function seedTenant(
  data: DataAdapters,
  tenantId: string,
  options: { clientId?: string; userIds?: string[] } = {},
) {
  await data.tenants.create({
    id: tenantId,
    friendly_name: tenantId,
    audience: "https://example.com",
    sender_email: "login@example.com",
    sender_name: "SenderName",
  });

  if (options.clientId) {
    await data.clients.create(tenantId, {
      client_id: options.clientId,
      client_secret: "clientSecret",
      name: options.clientId,
      callbacks: [],
      allowed_logout_urls: [],
      web_origins: [],
    });
  }

  await seedUsers(data, tenantId, options.userIds ?? []);
}

/** Create users so rows with a `(user_id, tenant_id)` foreign key can be seeded. */
export async function seedUsers(
  data: DataAdapters,
  tenantId: string,
  userIds: string[],
) {
  for (const userId of userIds) {
    await data.users.create(tenantId, {
      user_id: userId,
      email: `${encodeURIComponent(userId)}@example.com`,
      email_verified: true,
      connection: "email",
      provider: "email",
      is_social: false,
    });
  }
}
