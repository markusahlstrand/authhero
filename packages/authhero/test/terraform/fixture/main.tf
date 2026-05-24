# Exercises every auth0_* resource type the Linkfire terraform in /auth0 uses,
# against a local authhero server. The connection / client / tenant variants
# below mirror the strategies and app_types that /auth0 actually configures, so
# `terraform apply` here is a meaningful proxy for "will Linkfire's terraform
# apply against authhero".

terraform {
  required_providers {
    auth0 = {
      source  = "auth0/auth0"
      version = "~> 1.25.0"
    }
  }
  required_version = ">= 1.3"
}

variable "domain" {
  type = string
}

variable "client_id" {
  type = string
}

variable "client_secret" {
  type      = string
  sensitive = true
}

variable "audience" {
  type = string
}

provider "auth0" {
  domain        = var.domain
  client_id     = var.client_id
  client_secret = var.client_secret
  audience      = var.audience
  debug         = true
}

# ---------------------------------------------------------------------------
# Resource server + scopes
# ---------------------------------------------------------------------------

resource "auth0_resource_server" "test_api" {
  name       = "Test API"
  identifier = "https://test-api.example.com"
}

resource "auth0_resource_server_scopes" "test_api" {
  resource_server_identifier = auth0_resource_server.test_api.identifier
  scopes {
    name        = "read:items"
    description = "Read items"
  }
  scopes {
    name        = "write:items"
    description = "Write items"
  }
}

# ---------------------------------------------------------------------------
# Clients — one per Auth0 app_type that /auth0 uses (regular_web,
# non_interactive, spa, native).
# ---------------------------------------------------------------------------

resource "auth0_client" "regular_web" {
  name                = "TF Regular Web App"
  app_type            = "regular_web"
  callbacks           = ["https://example.com/callback"]
  allowed_logout_urls = ["https://example.com/logout"]
  web_origins         = ["https://example.com"]
  grant_types         = ["authorization_code", "refresh_token"]

  organization_usage             = "allow"
  organization_require_behavior  = "no_prompt"

  jwt_configuration {
    alg                 = "RS256"
    lifetime_in_seconds = 36000
  }
}

resource "auth0_client" "machine" {
  name        = "TF Machine Client"
  app_type    = "non_interactive"
  grant_types = ["client_credentials"]
}

resource "auth0_client" "spa" {
  name        = "TF SPA"
  app_type    = "spa"
  callbacks   = ["https://app.example.com/callback"]
  web_origins = ["https://app.example.com"]
  grant_types = ["authorization_code", "refresh_token"]

  refresh_token {
    rotation_type                = "rotating"
    expiration_type              = "expiring"
    leeway                       = 0
    token_lifetime               = 2592000
    idle_token_lifetime          = 1296000
    infinite_token_lifetime      = false
    infinite_idle_token_lifetime = false
  }
}

resource "auth0_client" "native" {
  name        = "TF Native"
  app_type    = "native"
  grant_types = ["authorization_code", "refresh_token"]

  refresh_token {
    rotation_type                = "non-rotating"
    expiration_type              = "non-expiring"
    leeway                       = 0
    token_lifetime               = 2592000
    idle_token_lifetime          = 1296000
    infinite_token_lifetime      = true
    infinite_idle_token_lifetime = true
  }

  native_social_login {
    apple {
      enabled = false
    }
    facebook {
      enabled = false
    }
  }
}

resource "auth0_client_grant" "machine_to_api" {
  client_id = auth0_client.machine.id
  audience  = auth0_resource_server.test_api.identifier
  scopes    = ["read:items", "write:items"]
}

# ---------------------------------------------------------------------------
# Connections — one per strategy /auth0 uses.
# ---------------------------------------------------------------------------

resource "auth0_connection" "username_password" {
  name     = "tf-database"
  strategy = "auth0"

  options {
    requires_username      = false
    brute_force_protection = true
  }
}

resource "auth0_connection" "google" {
  name     = "tf-google-oauth2"
  strategy = "google-oauth2"

  options {
    client_id     = "google-client-id"
    client_secret = "google-client-secret"
    scopes        = ["email", "profile"]
  }
}

resource "auth0_connection" "samlp" {
  name     = "tf-saml"
  strategy = "samlp"

  options {
    sign_in_endpoint     = "https://idp.example.com/saml/sso"
    signing_cert         = <<-EOT
      -----BEGIN CERTIFICATE-----
      MIIDazCCAlOgAwIBAgIUFakeCertForTFTestDoNotUseInProductionMA0GCSqG
      -----END CERTIFICATE-----
    EOT
    signature_algorithm  = "rsa-sha256"
    digest_algorithm     = "sha256"
    protocol_binding     = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"

    idp_initiated {
      client_id              = auth0_client.regular_web.id
      client_protocol        = "samlp"
      client_authorize_query = ""
    }
  }
}

resource "auth0_connection" "azuread" {
  name     = "tf-azuread"
  strategy = "waad"

  options {
    client_id         = "azuread-client-id"
    client_secret     = "azuread-client-secret"
    domain            = "example.onmicrosoft.com"
    domain_aliases    = ["example.com"]
    waad_protocol     = "openid-connect"
    identity_api      = "microsoft-identity-platform-v2.0"
    user_id_attribute = "sub"
  }
}

resource "auth0_connection" "oidc" {
  name     = "tf-oidc"
  strategy = "oidc"

  options {
    client_id              = "oidc-client-id"
    client_secret          = "oidc-client-secret"
    issuer                 = "https://idp.example.com/"
    authorization_endpoint = "https://idp.example.com/oauth2/authorize"
    token_endpoint         = "https://idp.example.com/oauth2/token"
    userinfo_endpoint      = "https://idp.example.com/oauth2/userinfo"
    jwks_uri               = "https://idp.example.com/.well-known/jwks.json"
    scopes                 = ["openid", "profile", "email"]
    type                   = "back_channel"
  }
}

resource "auth0_connection_clients" "username_password_clients" {
  connection_id   = auth0_connection.username_password.id
  enabled_clients = [auth0_client.regular_web.id, auth0_client.spa.id]
}

resource "auth0_connection_clients" "google_clients" {
  connection_id   = auth0_connection.google.id
  enabled_clients = [auth0_client.spa.id]
}

resource "auth0_connection_clients" "samlp_clients" {
  connection_id   = auth0_connection.samlp.id
  enabled_clients = [auth0_client.regular_web.id]
}

resource "auth0_connection_clients" "azuread_clients" {
  connection_id   = auth0_connection.azuread.id
  enabled_clients = [auth0_client.regular_web.id]
}

resource "auth0_connection_clients" "oidc_clients" {
  connection_id   = auth0_connection.oidc.id
  enabled_clients = [auth0_client.regular_web.id]
}

# ---------------------------------------------------------------------------
# Roles + permissions
# ---------------------------------------------------------------------------

resource "auth0_role" "editor" {
  name        = "tf-editor"
  description = "Can edit items"
}

resource "auth0_role_permissions" "editor" {
  role_id = auth0_role.editor.id
  permissions {
    name                       = "write:items"
    resource_server_identifier = auth0_resource_server.test_api.identifier
  }
}

# ---------------------------------------------------------------------------
# Organizations — one bare, one with branding + metadata.
# ---------------------------------------------------------------------------

resource "auth0_organization" "acme" {
  name         = "tf-acme"
  display_name = "Acme Corp"
}

resource "auth0_organization" "branded" {
  name         = "tf-branded"
  display_name = "Branded Inc"

  metadata = {
    plan = "enterprise"
    tier = "platinum"
  }

  branding {
    logo_url = "https://example.com/logo.png"
    colors = {
      primary         = "#0059d6"
      page_background = "#ffffff"
    }
  }
}

resource "auth0_organization_connections" "acme" {
  organization_id = auth0_organization.acme.id
  enabled_connections {
    connection_id              = auth0_connection.username_password.id
    assign_membership_on_login = false
  }
}

# ---------------------------------------------------------------------------
# Actions — one per trigger /auth0 uses (post-login, credentials-exchange,
# pre-user-registration). post-login also exercises the dependencies block.
# ---------------------------------------------------------------------------

resource "auth0_action" "post_login_noop" {
  name    = "tf-post-login-noop"
  runtime = "node22"
  code    = <<-EOT
    exports.onExecutePostLogin = async (event, api) => {};
  EOT
  supported_triggers {
    id      = "post-login"
    version = "v3"
  }

  dependencies {
    name    = "axios"
    version = "1.4.0"
  }
}

resource "auth0_action" "credentials_exchange_noop" {
  name    = "tf-credentials-exchange-noop"
  runtime = "node22"
  code    = <<-EOT
    exports.onExecuteCredentialsExchange = async (event, api) => {};
  EOT
  supported_triggers {
    id      = "credentials-exchange"
    version = "v2"
  }
}

resource "auth0_action" "pre_user_registration_noop" {
  name    = "tf-pre-user-registration-noop"
  runtime = "node22"
  code    = <<-EOT
    exports.onExecutePreUserRegistration = async (event, api) => {};
  EOT
  supported_triggers {
    id      = "pre-user-registration"
    version = "v2"
  }
}

resource "auth0_trigger_actions" "post_login" {
  trigger = "post-login"
  actions {
    id           = auth0_action.post_login_noop.id
    display_name = "tf-post-login-noop"
  }
}

# ---------------------------------------------------------------------------
# Branding (with font)
# ---------------------------------------------------------------------------

resource "auth0_branding" "company" {
  logo_url = "https://example.com/logo.png"
  colors {
    primary         = "#0059d6"
    page_background = "#ffffff"
  }
  font {
    url = "https://example.com/fonts/inter.woff2"
  }
}

# ---------------------------------------------------------------------------
# Email provider (mailgun, matching /auth0)
# ---------------------------------------------------------------------------

resource "auth0_email_provider" "mailgun" {
  name                 = "mailgun"
  enabled              = true
  default_from_address = "noreply@example.com"
  credentials {
    api_key = "key-test"
    domain  = "example.com"
    region  = "us"
  }
}

# ---------------------------------------------------------------------------
# Custom domain
# ---------------------------------------------------------------------------

resource "auth0_custom_domain" "primary" {
  domain = "auth.example.com"
  type   = "auth0_managed_certs"
}

# ---------------------------------------------------------------------------
# Guardian
# ---------------------------------------------------------------------------

resource "auth0_guardian" "factors" {
  policy = "all-applications"
  email  = true
}

# ---------------------------------------------------------------------------
# Tenant — match /auth0/modules/resources/tenant.tf flag set + lifetimes.
# ---------------------------------------------------------------------------

resource "auth0_tenant" "settings" {
  friendly_name         = "TF Test Tenant"
  default_directory     = auth0_connection.username_password.name
  default_audience      = auth0_resource_server.test_api.identifier
  support_email         = "support@example.com"
  enabled_locales       = ["en"]
  sandbox_version       = "22"
  session_lifetime      = 168
  idle_session_lifetime = 72

  flags {
    allow_legacy_delegation_grant_types    = false
    allow_legacy_ro_grant_types            = false
    allow_legacy_tokeninfo_endpoint        = false
    dashboard_insights_view                = false
    dashboard_log_streams_next             = false
    disable_clickjack_protection_headers   = false
    disable_management_api_sms_obfuscation = false
    enable_apis_section                    = false
    enable_client_connections              = false
    enable_custom_domain_in_emails         = true
    enable_dynamic_client_registration     = false
    enable_idtoken_api2                    = false
    enable_legacy_logs_search_v2           = false
    enable_legacy_profile                  = false
    enable_pipeline2                       = false
    enable_public_signup_user_exists_error = false
    mfa_show_factor_list_on_enrollment     = false
    no_disclose_enterprise_connections     = false
    revoke_refresh_token_grant             = false
    use_scope_descriptions_for_consent     = false
  }

  sessions {
    oidc_logout_prompt_enabled = false
  }
}

# ---------------------------------------------------------------------------
# Log stream — http sink (Linkfire's loki_mgmt is an http stream).
# ---------------------------------------------------------------------------

resource "auth0_log_stream" "loki" {
  name   = "tf-loki"
  type   = "http"
  status = "active"

  sink {
    http_endpoint       = "https://logs.example.com/loki/api/v1/push"
    http_content_type   = "application/json"
    http_content_format = "JSONLINES"
    http_authorization  = "Bearer tf-test-token"
  }
}

# ---------------------------------------------------------------------------
# Attack protection — singleton.
# ---------------------------------------------------------------------------

resource "auth0_attack_protection" "ap" {
  breached_password_detection {
    enabled = true
    shields = ["block", "admin_notification"]
  }

  brute_force_protection {
    enabled      = true
    mode         = "count_per_identifier_and_ip"
    max_attempts = 10
  }

  suspicious_ip_throttling {
    enabled = true
    shields = ["block", "admin_notification"]
  }
}

# ---------------------------------------------------------------------------
# Prompt custom text — exercise both empty body and a populated jsonencode
# body (matching the variants /auth0 uses).
# ---------------------------------------------------------------------------

resource "auth0_prompt_custom_text" "en_login" {
  prompt   = "login"
  language = "en"
  body     = "{}"
}

resource "auth0_prompt_custom_text" "en_login_id" {
  prompt   = "login-id"
  language = "en"
  body = jsonencode({
    "login-id" : {
      "description" : "Sign in to continue",
      "title"       : "Welcome"
    }
  })
}
