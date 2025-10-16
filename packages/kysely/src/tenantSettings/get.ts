import { Kysely } from "kysely";
import { TenantSettings } from "@authhero/adapter-interfaces";
import { Database } from "../db";
import { removeNullProperties } from "../helpers/remove-nulls";

export function get(db: Kysely<Database>) {
  return async (tenant_id: string): Promise<TenantSettings | null> => {
    const [settings] = await db
      .selectFrom("tenant_settings")
      .where("tenant_settings.tenant_id", "=", tenant_id)
      .selectAll()
      .execute();

    if (!settings) {
      return null;
    }

    const { tenant_id: _, ...rest } = settings;

    // Parse JSON fields and convert boolean integers
    const parsed: TenantSettings = removeNullProperties({
      idle_session_lifetime: rest.idle_session_lifetime,
      session_lifetime: rest.session_lifetime,
      session_cookie: rest.session_cookie
        ? JSON.parse(rest.session_cookie)
        : undefined,
      enable_client_connections: rest.enable_client_connections === 1,
      default_redirection_uri: rest.default_redirection_uri,
      enabled_locales: rest.enabled_locales
        ? JSON.parse(rest.enabled_locales)
        : undefined,
      default_directory: rest.default_directory,
      error_page: rest.error_page ? JSON.parse(rest.error_page) : undefined,
      flags: rest.flags ? JSON.parse(rest.flags) : undefined,
      friendly_name: rest.friendly_name,
      picture_url: rest.picture_url,
      support_email: rest.support_email,
      support_url: rest.support_url,
      sandbox_version: rest.sandbox_version,
      sandbox_versions_available: rest.sandbox_versions_available
        ? JSON.parse(rest.sandbox_versions_available)
        : undefined,
      change_password: rest.change_password
        ? JSON.parse(rest.change_password)
        : undefined,
      guardian_mfa_page: rest.guardian_mfa_page
        ? JSON.parse(rest.guardian_mfa_page)
        : undefined,
      default_audience: rest.default_audience,
      default_organization: rest.default_organization,
      sessions: rest.sessions ? JSON.parse(rest.sessions) : undefined,
    });

    return parsed;
  };
}
