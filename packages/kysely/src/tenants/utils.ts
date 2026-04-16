import { Tenant } from "@authhero/adapter-interfaces";
import { removeNullProperties } from "../helpers/remove-nulls";
import {
  stringifyProperties,
  removeUndefinedAndNull,
} from "../helpers/stringify";

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
  if (sqlTenant.mfa && typeof sqlTenant.mfa === "string") {
    tenant.mfa = JSON.parse(sqlTenant.mfa);
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
  stringifyProperties(
    tenant,
    [
      "session_cookie",
      "enabled_locales",
      "error_page",
      "flags",
      "sandbox_versions_available",
      "change_password",
      "guardian_mfa_page",
      "sessions",
      "oidc_logout",
      "device_flow",
      "default_token_quota",
      "allowed_logout_urls",
      "acr_values_supported",
      "mtls",
      "mfa",
    ],
    sqlTenant,
  );

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

  // Strip undefined and null values to keep SQL payload clean
  return removeUndefinedAndNull(sqlTenant);
}
