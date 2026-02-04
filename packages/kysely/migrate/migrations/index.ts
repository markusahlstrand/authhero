import * as m1_init from "./2022-12-11T09:17:35_init";
import * as m2_magicLink from "./2023-09-21T10:12:15_support-url";
import * as m3_updateAt from "./2023-10-26T06:57:21_updated_at";
import * as m4_logTable from "./2023-10-26T08:14:09_log_table";
import * as m5_userProfile from "./2023-10-27T16:00:11_picture-length";
import * as m6_sessions from "./2023-11-02T23:18:12_sessions";
import * as m7_passwords from "./2023-11-07T23:18:12_passwords";
import * as m8_logsTableNewFields from "./2023-11-08T17:12:09_logs-table-new-fields";
import * as m9_passwordTableNewField from "./2023-11-16T14:27:00_passwords-table-password";
import * as n01_codesTable from "./2023-11-17T10:34:00_codes-fields";
import * as n11_universalLoginSession from "./2023-11-19T20:53:00_univeral-login-session";
import * as n12_userFields from "./2023-11-21T12:30:00_user-fields";
import * as n13_userEmailIndex from "./2023-11-21T15:57:00_user-indexes";
import * as n14_profileDataField from "./2023-11-23T17:44:00_profile-data-field";
import * as n15_userEmailIndex from "./2023-12-08T15:59:00_user-linked-to-index";
import * as n16_userLocale from "./2023-12-21T15:05:00_user-locale";
import * as n17_signingKeys from "./2023-12-26T10:58:00_signing-keys";
import * as n18_logsFields from "./2024-01-06T16:23:00_logs-fields";
import * as n19_connectionsUserinfo from "./2024-01-10T23:19:00_connections-userinfo";
import * as n20_missingFields from "./2024-01-11T10:58:00_missing-fields";
import * as n21_sessionDeletedAt from "./2024-01-17T10:51:00_session-deleted-at";
import * as n22_dropLogsFields from "./2024-01-31T09:00:00_drop-logs-fields";
import * as n23_dropUsersFields from "./2024-02-02T15:55:00_drop-users-fields";
import * as n24_logsIndexes from "./2024-02-02T16:55:00_logs-indexes";
import * as n25_logDescMaxLength from "./2024-02-05T18:35:00_log-desc-max-length";
import * as n26_logsTableExtraFields from "./2024-02-08T12:45:00_logs-table-extra-fields";
import * as n27_usersTableNameIndex from "./2024-02-13T11:25:00_users-table-name-index";
import * as n28_usersEmailConstrain from "./2024-02-19T20:14:00_users-email-constrain";
import * as n29_increaseOtpStateLength from "./2024-03-11T12:45:00_increase-otp-state-length";
import * as n30_increaseTicketStateLength from "./2024-04-22T14:48:00_increase-ticket-state-length";
import * as n31_branding from "./2024-05-09T08:50:00_branding";
import * as n32_indexesAndNotNull from "./2024-05-14T07:53:00_indexes_and_not_null";
import * as n33_vendorIdInUniversalLoginSession from "./2024-05-16T10:45:00_vendor_id_in_universal_login_session";
import * as n34_auth0ClientInUniversalLoginSession from "./2024-05-23T15:53:00_auth0client_in_universal_login_session";
import * as n35_increaseUniversalSessionStateLength from "./2024-05-24T16:25:00_increase-universal-auth-state-length";
import * as n36_authenticationCodes from "./2024-05-27T23:50:00_authentication_codes";
import * as n37_disableSignUps from "./2024-06-03T10:00:00_disable-sign-ups";
import * as n38_otpIpAddress from "./2024-06-05T10:00:00_otp-ip-address";
import * as n39_increaseUserAgentLength from "./2024-06-19T10:00:00_increase-user-agent-length";
import * as n40_userId from "./2024-07-15T10:00:00_user_id";
import * as n41_hooks from "./2024-07-15T12:52:00_hooks";
import * as n42_userIdIndexes from "./2024-07-22T12:52:00_user-indexes";
import * as n43_userIdIndexes from "./2024-07-25T12:19:00_session_id";
import * as n44_codes from "./2024-07-26T10:18:00_codes";
import * as n45_hookProperties from "./2024-07-26T14:18:00_hook-properties";
import * as n46_loginAuth0Client from "./2024-08-01T14:19:00_login_auth0_client";
import * as n47_loginAuth0Client from "./2024-08-01T15:52:00_login_state";
import * as n48_saml from "./2024-08-16T13:45:00_saml";
import * as n49_removeFields from "./2024-08-20T08:50:00_remove_fields";
import * as n50_authParamsNonce from "./2024-08-22T08:26:00_authparams_nonce";
import * as n51_connectionid from "./2024-08-22T11:54:00_connection_id";
import * as n52_cert from "./2024-08-26T18:38:00_cert";
import * as n53_codes_primary_key from "./2024-08-27T14:35:00_codes_primay_key";
import * as n54_cleanup_tables from "./2024-08-27T23:48:00_remove_unused";
import * as n55_logs_index from "./2024-08-30T16:41:00_logs_index";
import * as n56_application_fields from "./2024-09-03T08:48:00_application_fields";
import * as n57_prompt_settings from "./2024-09-03T15:15:00_prompt_settings";
import * as n58_connection_client_id from "./2024-09-04T08:41:00_connection_client_id";
import * as n59_connection_options from "./2024-09-15T19:31:00_connection_options";
import * as n60_users_metadata from "./2024-09-16T17:02:00_users_metadata";
import * as n61_userLocales from "./2024-10-01T9:09:00_ui_locales";
import * as n62_prompt from "./2024-10-19T07:47:00_prompt";
import * as n63_connection_cleanup from "./2024-10-22T09:01:00_connection_cleanup";
import * as n64_act_as from "./2024-11-18T10:37:00_act_as";
import * as n65_code_verifier from "./2024-11-22T17:48:00_code_verifier";
import * as n66_email_providers from "./2024-12-04T23:34:00_email_provider";
import * as n67_drop_tickets from "./2024-12-05T13:05:00_drop_tickets";
import * as n68_login_useragents from "./2024-12-05T13:20:00_login_useragent";
import * as n70_refresh_tokens from "./2025-02-03T08:48:00_refresh_tokens";
import * as n71_session_new_fields from "./2025-02-11T13:54:00_session_new_fields";
import * as n72_session_primary_key from "./2025-02-12T13:15:00_session_primary_key";
import * as n73_drop_sessions from "./2025-02-12T15:27:00_drop_sessions";
import * as n74_custom_domains from "./2025-02-21T23:45:00_custom_domains";
import * as n75_organizations from "./2025-03-10T11:20:00_organization";
import * as n76_authorization_url_length from "./2025-03-12T14:14:00_authorization_url_length";
import * as n77_drop_sessions from "./2025-03-14T21:58:00_drop_session";
import * as n78_login_sessions from "./2025-03-14T22:41:00_login_sessions";
import * as n79_drop_sessions_2 from "./2025-03-19T15:47:00_drop_sessions_2";
import * as n80_recreate_custom_domains from "./2025-03-21T11:08:00_recreate_custom_domains";
import * as n81_phone from "./2025-04-22T14:00:00_phone";
import * as n82_forms from "./2025-05-21T10:00:00_forms";
import * as n83_addFormsIdToHooks from "./2025-05-29T00:00:00_add_forms_id_to_hooks";
import * as n84_login_completed from "./2025-05-30T00:00:00_login_completed";
import * as n85_add_login_session_id_to_sessions from "./2025-06-04T12:00:00_add_login_session_id_to_sessions";
import * as n86_index_sessions_login_session_id from "./2025-06-04T13:00:00_index_sessions_login_session_id";
import * as n87_code_challenge from "./2025-06-04T14:00:00_code_challenge";
import * as n88_add_redirect_uri_to_codes from "./2025-06-05T09:40:00_add_redirect_uri_to_codes";
import * as n89_add_nonce_and_state_to_codes from "./2025-06-05T14:30:00_add_nonce_and_state_to_codes";
import * as n90_themes from "./2025-07-23T14:30:00_themes";
import * as n91_resource_servers_rules_permissions from "./2025-08-11T12:00:00_resource_servers_rules_permissions";
import * as n92_role_permissions from "./2025-08-13T15:00:00_role_user_permissions";
import * as n93_add_permissions_to_roles from "./2025-08-14T09:30:00_user_roles";
import * as n94_keys_connection_and_extend_columns from "./2025-08-20T12:00:00_keys_connection_and_extend_columns";
import * as n95_create_organizations_table from "./2025-09-10T10:00:00_create_organizations_table";
import * as n96_create_user_organizations_table from "./2025-09-10T11:00:00_create_user_organizations_table";
import * as n97_add_organization_to_user_permissions_and_roles from "./2025-09-11T12:00:00_add_organization_to_user_permissions_and_roles";
import * as n98_clients from "./2025-09-16T12:00:00_clients";
import * as n99_update_client_foreign_keys from "./2025-09-16T12:30:00_update_client_foreign_keys";
import * as o001_client_grants from "./2025-09-18T12:00:00_client_grants";
import * as o002_drop_applications from "./2025-09-19T10:56:35_drop_applications";
import * as o003_phone_number_index from "./2025-09-24T12:00:00_phone_number_index";
import * as o004_login_sessions_id_index from "./2025-09-24T12:30:00_login_sessions_id_index";
import * as o005_connections_tenant_index from "./2025-09-24T13:00:00_connections_tenant_index";
import * as o006_remove_redundant_user_organizations_tenant_index from "./2025-09-24T13:30:00_remove_redundant_user_organizations_tenant_index";
import * as o007_tenant_settings from "./2025-10-16T12:00:00_tenant_settings";
import * as o008_merge_tenant_settings_into_tenants from "./2025-10-17T10:00:00_merge_tenant_settings_into_tenants";
import * as o009_create_invites_table from "./2025-10-27T14:00:00_create_invites_table";
import * as o010_add_log_id_to_logs from "./2025-11-03T10:00:00_add_log_id_to_logs";
import * as o011_add_location_info_to_logs from "./2025-11-28T10:00:00_add_location_info_to_logs";
import * as o012_add_password_history from "./2025-12-03T19:45:12_add_password_history";
import * as o013_connection_display_name from "./2025-12-09T10:00:00_connection_display_name";
import * as o014_client_connections from "./2025-12-12T10:00:00_client_connections";
import * as o015_flows from "./2025-12-19T10:00:00_actions";
import * as o016_add_is_system_column from "./2025-12-20T10:00:00_add_is_system_column";
import * as o017_connections_composite_key from "./2026-01-07T10:00:00_connections_composite_key";
import * as o018_login_session_state from "./2026-01-10T10:00:00_login_session_state";
import * as o019_roles_resource_servers_metadata from "./2026-01-14T10:00:00_roles_resource_servers_metadata";
import * as o020_session_add_timestamp_columns from "./2026-01-15T10:00:00_session_add_timestamp_columns";
import * as o021_session_cleanup_and_ulid from "./2026-01-22T10:00:00_session_cleanup_and_ulid";
import * as o022_oidc_profile_claims from "./2026-01-28T10:00:00_oidc_profile_claims";
import * as o023_preferred_username from "./2026-01-28T11:00:00_preferred_username";
import * as o024_user_address from "./2026-01-28T12:00:00_user_address";
import * as o025_authparams_max_age from "./2026-01-28T13:00:00_authparams_max_age";
import * as o026_auth0_conformant from "./2026-01-28T14:00:00_auth0_conformant";
import * as o027_universal_login_templates from "./2026-01-30T10:00:00_universal_login_templates";
import * as o028_custom_text from "./2026-02-04T10:00:00_custom_text";

// These need to be in alphabetic order
export default {
  m1_init,
  m2_magicLink,
  m3_updateAt,
  m4_logTable,
  m5_userProfile,
  m6_sessions,
  m7_passwords,
  m8_logsTableNewFields,
  m9_passwordTableNewField,
  n01_codesTable,
  n11_universalLoginSession,
  n12_userFields,
  n13_userEmailIndex,
  n14_profileDataField,
  n15_userEmailIndex,
  n16_userLocale,
  n17_signingKeys,
  n18_logsFields,
  n19_connectionsUserinfo,
  n20_missingFields,
  n21_sessionDeletedAt,
  n22_dropLogsFields,
  n23_dropUsersFields,
  n24_logsIndexes,
  n25_logDescMaxLength,
  n26_logsTableExtraFields,
  n27_usersTableNameIndex,
  n28_usersEmailConstrain,
  n29_increaseOtpStateLength,
  n30_increaseTicketStateLength,
  n31_branding,
  n32_indexesAndNotNull,
  n33_vendorIdInUniversalLoginSession,
  n34_auth0ClientInUniversalLoginSession,
  n35_increaseUniversalSessionStateLength,
  n36_authenticationCodes,
  n37_disableSignUps,
  n38_otpIpAddress,
  n39_increaseUserAgentLength,
  n40_userId,
  n41_hooks,
  n42_userIdIndexes,
  n43_userIdIndexes,
  n44_codes,
  n45_hookProperties,
  n46_loginAuth0Client,
  n47_loginAuth0Client,
  n48_saml,
  n49_removeFields,
  n50_authParamsNonce,
  n51_connectionid,
  n52_cert,
  n53_codes_primary_key,
  n54_cleanup_tables,
  n55_logs_index,
  n56_application_fields,
  n57_prompt_settings,
  n58_connection_client_id,
  n59_connection_options,
  n60_users_metadata,
  n61_userLocales,
  n62_prompt,
  n63_connection_cleanup,
  n64_act_as,
  n65_code_verifier,
  n66_email_providers,
  n67_drop_tickets,
  n68_login_useragents,
  n70_refresh_tokens,
  n71_session_new_fields,
  n72_session_primary_key,
  n73_drop_sessions,
  n74_custom_domains,
  n75_organizations,
  n76_authorization_url_length,
  n77_drop_sessions,
  n78_login_sessions,
  n79_drop_sessions_2,
  n80_recreate_custom_domains,
  n81_phone,
  n82_forms,
  n83_addFormsIdToHooks,
  n84_login_completed,
  n85_add_login_session_id_to_sessions,
  n86_index_sessions_login_session_id,
  n87_code_challenge,
  n88_add_redirect_uri_to_codes,
  n89_add_nonce_and_state_to_codes,
  n90_themes,
  n91_resource_servers_rules_permissions,
  n92_role_permissions,
  n93_add_permissions_to_roles,
  n94_keys_connection_and_extend_columns,
  n95_create_organizations_table,
  n96_create_user_organizations_table,
  n97_add_organization_to_user_permissions_and_roles,
  n98_clients,
  n99_update_client_foreign_keys,
  o001_client_grants,
  o002_drop_applications,
  o003_phone_number_index,
  o004_login_sessions_id_index,
  o005_connections_tenant_index,
  o006_remove_redundant_user_organizations_tenant_index,
  o007_tenant_settings,
  o008_merge_tenant_settings_into_tenants,
  o009_create_invites_table,
  o010_add_log_id_to_logs,
  o011_add_location_info_to_logs,
  o012_add_password_history,
  o013_connection_display_name,
  o014_client_connections,
  o015_flows,
  o016_add_is_system_column,
  o017_connections_composite_key,
  o018_login_session_state,
  o019_roles_resource_servers_metadata,
  o020_session_add_timestamp_columns,
  o021_session_cleanup_and_ulid,
  o022_oidc_profile_claims,
  o023_preferred_username,
  o024_user_address,
  o025_authparams_max_age,
  o026_auth0_conformant,
  o027_universal_login_templates,
  o028_custom_text,
};
