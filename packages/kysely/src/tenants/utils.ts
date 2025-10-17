import { Tenant } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";

export function sqlTenantToTenant(sqlTenant: any): Tenant {
  const tenant: any = {
    ...sqlTenant,
  };

  // Convert JSON strings to objects
  if (
    sqlTenant.session_cookie &&
    typeof sqlTenant.session_cookie === "string"
  ) {
    tenant.session_cookie = JSON.parse(sqlTenant.session_cookie);
  }
  if (
    sqlTenant.enabled_locales &&
    typeof sqlTenant.enabled_locales === "string"
  ) {
    tenant.enabled_locales = JSON.parse(sqlTenant.enabled_locales);
  }
  if (sqlTenant.error_page && typeof sqlTenant.error_page === "string") {
    tenant.error_page = JSON.parse(sqlTenant.error_page);
  }
  if (sqlTenant.flags && typeof sqlTenant.flags === "string") {
    tenant.flags = JSON.parse(sqlTenant.flags);
  }
  if (
    sqlTenant.sandbox_versions_available &&
    typeof sqlTenant.sandbox_versions_available === "string"
  ) {
    tenant.sandbox_versions_available = JSON.parse(
      sqlTenant.sandbox_versions_available,
    );
  }
  if (
    sqlTenant.change_password &&
    typeof sqlTenant.change_password === "string"
  ) {
    tenant.change_password = JSON.parse(sqlTenant.change_password);
  }
  if (
    sqlTenant.guardian_mfa_page &&
    typeof sqlTenant.guardian_mfa_page === "string"
  ) {
    tenant.guardian_mfa_page = JSON.parse(sqlTenant.guardian_mfa_page);
  }
  if (sqlTenant.sessions && typeof sqlTenant.sessions === "string") {
    tenant.sessions = JSON.parse(sqlTenant.sessions);
  }

  // Convert integer to boolean
  if (sqlTenant.enable_client_connections !== undefined) {
    tenant.enable_client_connections =
      sqlTenant.enable_client_connections === 1;
  }

  return removeNullProperties(tenant);
}

export function tenantToSqlTenant(tenant: Partial<Tenant>): any {
  const sqlTenant: any = { ...tenant };

  // Convert objects to JSON strings
  if (tenant.session_cookie !== undefined) {
    sqlTenant.session_cookie = JSON.stringify(tenant.session_cookie);
  }
  if (tenant.enabled_locales !== undefined) {
    sqlTenant.enabled_locales = JSON.stringify(tenant.enabled_locales);
  }
  if (tenant.error_page !== undefined) {
    sqlTenant.error_page = JSON.stringify(tenant.error_page);
  }
  if (tenant.flags !== undefined) {
    sqlTenant.flags = JSON.stringify(tenant.flags);
  }
  if (tenant.sandbox_versions_available !== undefined) {
    sqlTenant.sandbox_versions_available = JSON.stringify(
      tenant.sandbox_versions_available,
    );
  }
  if (tenant.change_password !== undefined) {
    sqlTenant.change_password = JSON.stringify(tenant.change_password);
  }
  if (tenant.guardian_mfa_page !== undefined) {
    sqlTenant.guardian_mfa_page = JSON.stringify(tenant.guardian_mfa_page);
  }
  if (tenant.sessions !== undefined) {
    sqlTenant.sessions = JSON.stringify(tenant.sessions);
  }

  // Convert boolean to integer
  if (tenant.enable_client_connections !== undefined) {
    sqlTenant.enable_client_connections = tenant.enable_client_connections
      ? 1
      : 0;
  }

  return sqlTenant;
}
