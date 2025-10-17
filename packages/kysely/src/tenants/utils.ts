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
  if (sqlTenant.oidc_logout && typeof sqlTenant.oidc_logout === "string") {
    tenant.oidc_logout = JSON.parse(sqlTenant.oidc_logout);
  }
  if (sqlTenant.device_flow && typeof sqlTenant.device_flow === "string") {
    tenant.device_flow = JSON.parse(sqlTenant.device_flow);
  }
  if (
    sqlTenant.default_token_quota &&
    typeof sqlTenant.default_token_quota === "string"
  ) {
    tenant.default_token_quota = JSON.parse(sqlTenant.default_token_quota);
  }
  if (
    sqlTenant.allowed_logout_urls &&
    typeof sqlTenant.allowed_logout_urls === "string"
  ) {
    tenant.allowed_logout_urls = JSON.parse(sqlTenant.allowed_logout_urls);
  }
  if (
    sqlTenant.acr_values_supported &&
    typeof sqlTenant.acr_values_supported === "string"
  ) {
    tenant.acr_values_supported = JSON.parse(sqlTenant.acr_values_supported);
  }
  if (sqlTenant.mtls && typeof sqlTenant.mtls === "string") {
    tenant.mtls = JSON.parse(sqlTenant.mtls);
  }

  // Convert integer to boolean
  if (sqlTenant.allow_organization_name_in_authentication_api !== undefined) {
    tenant.allow_organization_name_in_authentication_api =
      sqlTenant.allow_organization_name_in_authentication_api === 1;
  }
  if (sqlTenant.customize_mfa_in_postlogin_action !== undefined) {
    tenant.customize_mfa_in_postlogin_action =
      sqlTenant.customize_mfa_in_postlogin_action === 1;
  }
  if (sqlTenant.pushed_authorization_requests_supported !== undefined) {
    tenant.pushed_authorization_requests_supported =
      sqlTenant.pushed_authorization_requests_supported === 1;
  }
  if (sqlTenant.authorization_response_iss_parameter_supported !== undefined) {
    tenant.authorization_response_iss_parameter_supported =
      sqlTenant.authorization_response_iss_parameter_supported === 1;
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
  if (tenant.oidc_logout !== undefined) {
    sqlTenant.oidc_logout = JSON.stringify(tenant.oidc_logout);
  }
  if (tenant.device_flow !== undefined) {
    sqlTenant.device_flow = JSON.stringify(tenant.device_flow);
  }
  if (tenant.default_token_quota !== undefined) {
    sqlTenant.default_token_quota = JSON.stringify(tenant.default_token_quota);
  }
  if (tenant.allowed_logout_urls !== undefined) {
    sqlTenant.allowed_logout_urls = JSON.stringify(tenant.allowed_logout_urls);
  }
  if (tenant.acr_values_supported !== undefined) {
    sqlTenant.acr_values_supported = JSON.stringify(
      tenant.acr_values_supported,
    );
  }
  if (tenant.mtls !== undefined) {
    sqlTenant.mtls = JSON.stringify(tenant.mtls);
  }

  // Convert boolean to integer
  if (tenant.allow_organization_name_in_authentication_api !== undefined) {
    sqlTenant.allow_organization_name_in_authentication_api =
      tenant.allow_organization_name_in_authentication_api ? 1 : 0;
  }
  if (tenant.customize_mfa_in_postlogin_action !== undefined) {
    sqlTenant.customize_mfa_in_postlogin_action =
      tenant.customize_mfa_in_postlogin_action ? 1 : 0;
  }
  if (tenant.pushed_authorization_requests_supported !== undefined) {
    sqlTenant.pushed_authorization_requests_supported =
      tenant.pushed_authorization_requests_supported ? 1 : 0;
  }
  if (tenant.authorization_response_iss_parameter_supported !== undefined) {
    sqlTenant.authorization_response_iss_parameter_supported =
      tenant.authorization_response_iss_parameter_supported ? 1 : 0;
  }

  return sqlTenant;
}
