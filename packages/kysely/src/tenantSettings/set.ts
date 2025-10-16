import { TenantSettings } from "@authhero/adapter-interfaces";
import { Kysely } from "kysely";
import { Database } from "../db";

export function set(db: Kysely<Database>) {
  return async (tenant_id: string, settings: TenantSettings) => {
    // Convert complex objects to JSON strings for storage and booleans to integers
    const dbSettings = {
      tenant_id,
      idle_session_lifetime: settings.idle_session_lifetime,
      session_lifetime: settings.session_lifetime,
      session_cookie: settings.session_cookie
        ? JSON.stringify(settings.session_cookie)
        : undefined,
      enable_client_connections:
        settings.enable_client_connections !== undefined
          ? settings.enable_client_connections
            ? 1
            : 0
          : undefined,
      default_redirection_uri: settings.default_redirection_uri,
      enabled_locales: settings.enabled_locales
        ? JSON.stringify(settings.enabled_locales)
        : undefined,
      default_directory: settings.default_directory,
      error_page: settings.error_page
        ? JSON.stringify(settings.error_page)
        : undefined,
      flags: settings.flags ? JSON.stringify(settings.flags) : undefined,
      friendly_name: settings.friendly_name,
      picture_url: settings.picture_url,
      support_email: settings.support_email,
      support_url: settings.support_url,
      sandbox_version: settings.sandbox_version,
      sandbox_versions_available: settings.sandbox_versions_available
        ? JSON.stringify(settings.sandbox_versions_available)
        : undefined,
      change_password: settings.change_password
        ? JSON.stringify(settings.change_password)
        : undefined,
      guardian_mfa_page: settings.guardian_mfa_page
        ? JSON.stringify(settings.guardian_mfa_page)
        : undefined,
      default_audience: settings.default_audience,
      default_organization: settings.default_organization,
      sessions: settings.sessions
        ? JSON.stringify(settings.sessions)
        : undefined,
    };

    try {
      await db.insertInto("tenant_settings").values(dbSettings).execute();
    } catch (error) {
      await db
        .updateTable("tenant_settings")
        .set(dbSettings)
        .where("tenant_id", "=", tenant_id)
        .execute();
    }
  };
}
