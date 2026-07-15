// Render snapshots for the universal-login auth forms. These share a page
// shell (AuthCard), theme styles (getThemeStyles), and a password field
// (PasswordField); the snapshots guard against visual drift between the
// screens when those shared pieces change.
import { describe, it, expect, beforeAll } from "vitest";
import i18next from "i18next";
import {
  AuthorizationResponseType,
  LoginSessionState,
  type Theme,
  type Branding,
  type LoginSession,
} from "@authhero/adapter-interfaces";
import type { EnrichedClient } from "../helpers/client";
import { renderHonoComponent } from "../storybook-utils/HonoJSXWrapper";
import EnterPasswordForm from "./EnterPasswordForm";
import ResetPasswordForm from "./ResetPasswordForm";
import SignUpForm from "./SignUpForm";
import ForgotPasswordForm from "./ForgotPasswordForm";
import LoginForm from "./LoginForm";
import IdentifierForm from "./IdentifierForm";

beforeAll(() => {
  i18next.init({ lng: "en", fallbackLng: "en", resources: {} });
});

const loginSession: LoginSession = {
  id: "mock-session-id",
  authParams: {
    client_id: "mock-client-id",
    redirect_uri: "http://localhost:3000/callback",
    response_type: AuthorizationResponseType.CODE,
    scope: "openid profile email",
    state: "mock-state",
    username: "user@example.com",
  },
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  expires_at: "2024-01-01T01:00:00.000Z",
  csrf_token: "mock-csrf-token",
  state: LoginSessionState.PENDING,
};

const theme: Theme = {
  themeId: "mock-theme",
  displayName: "Default Theme",
  page_background: {
    background_color: "#f3f4f6",
    background_image_url: "",
    page_layout: "center",
  },
  colors: {
    base_focus_color: "#0066cc",
    base_hover_color: "#0052a3",
    body_text: "#333333",
    captcha_widget_theme: "auto",
    error: "#dc2626",
    header: "#111827",
    icons: "#6b7280",
    input_background: "#ffffff",
    input_border: "#d1d5db",
    input_filled_text: "#111827",
    input_labels_placeholders: "#6b7280",
    links_focused_components: "#0066cc",
    primary_button: "#0066cc",
    primary_button_label: "#ffffff",
    secondary_button_border: "#d1d5db",
    secondary_button_label: "#374151",
    success: "#10b981",
    widget_background: "#ffffff",
    widget_border: "#e5e7eb",
  },
  borders: {
    button_border_radius: 4,
    button_border_weight: 1,
    buttons_style: "rounded",
    input_border_radius: 4,
    input_border_weight: 1,
    inputs_style: "rounded",
    show_widget_shadow: true,
    widget_border_weight: 1,
    widget_corner_radius: 8,
  },
  fonts: {
    body_text: { bold: false, size: 100 },
    buttons_text: { bold: true, size: 100 },
    font_url: "",
    input_labels: { bold: false, size: 100 },
    links: { bold: true, size: 100 },
    links_style: "normal",
    reference_text_size: 15,
    subtitle: { bold: false, size: 100 },
    title: { bold: true, size: 150 },
  },
  widget: {
    header_text_alignment: "center",
    logo_height: 52,
    logo_position: "center",
    logo_url: "http://acmelogos.com/images/logo-5.svg",
    social_buttons_layout: "bottom",
  },
};

const branding: Branding = {
  logo_url: "http://acmelogos.com/images/logo-5.svg",
  colors: { primary: "#0066cc" },
};

const client: EnrichedClient = {
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
  name: "Test Application",
  client_id: "test-client-id",
  global: false,
  is_first_party: true,
  oidc_conformant: true,
  auth0_conformant: true,
  sso: false,
  sso_disabled: false,
  cross_origin_authentication: false,
  custom_login_page_on: false,
  require_pushed_authorization_requests: false,
  require_proof_of_possession: false,
  tenant: {
    id: "test-tenant",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    friendly_name: "Test Tenant",
    audience: "https://test-tenant.authhero.com",
    sender_email: "noreply@authhero.com",
    sender_name: "AuthHero",
    session_lifetime: 168,
    idle_session_lifetime: 72,
  },
  connections: [],
};

// A client exposing both a database connection (drives the email input) and a
// social connection (drives a provider button + separator), so the
// IdentifierForm input/button/separator/provider branches are exercised
// alongside the empty-connections case above.
const clientWithConnections: EnrichedClient = {
  ...client,
  connections: [
    {
      id: "db-connection-id",
      name: "Username-Password-Authentication",
      strategy: "auth0",
      options: {},
      enabled_clients: ["test-client-id"],
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    },
    {
      id: "google-connection-id",
      name: "google-oauth2",
      strategy: "google-oauth2",
      options: {},
      enabled_clients: ["test-client-id"],
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    },
  ],
};

const noLogoTheme: Theme = {
  ...theme,
  widget: { ...theme.widget, logo_position: "none" },
};

const base = { theme, branding, loginSession, client };

describe("universal-login auth form rendering", () => {
  it("EnterPasswordForm", () => {
    expect(
      renderHonoComponent(EnterPasswordForm, {
        ...base,
        email: "user@example.com",
      }),
    ).toMatchSnapshot();
  });
  it("EnterPasswordForm error", () => {
    expect(
      renderHonoComponent(EnterPasswordForm, {
        ...base,
        email: "user@example.com",
        error: "Invalid password",
      }),
    ).toMatchSnapshot();
  });
  it("ResetPasswordForm", () => {
    expect(
      renderHonoComponent(ResetPasswordForm, {
        ...base,
        email: "user@example.com",
      }),
    ).toMatchSnapshot();
  });
  it("ResetPasswordForm error no-logo", () => {
    expect(
      renderHonoComponent(ResetPasswordForm, {
        ...base,
        theme: noLogoTheme,
        email: "user@example.com",
        error: "Weak password",
      }),
    ).toMatchSnapshot();
  });
  it("SignUpForm", () => {
    expect(renderHonoComponent(SignUpForm, { ...base })).toMatchSnapshot();
  });
  it("SignUpForm error prefilled", () => {
    expect(
      renderHonoComponent(SignUpForm, {
        ...base,
        email: "user@example.com",
        code: "abc123",
        error: "Passwords do not match",
      }),
    ).toMatchSnapshot();
  });
  it("ForgotPasswordForm", () => {
    expect(renderHonoComponent(ForgotPasswordForm, { ...base })).toMatchSnapshot();
  });
  it("LoginForm", () => {
    expect(
      renderHonoComponent(LoginForm, {
        theme,
        branding,
        state: "mock-state",
        email: "user@example.com",
        client,
      }),
    ).toMatchSnapshot();
  });
  it("IdentifierForm", () => {
    expect(renderHonoComponent(IdentifierForm, { ...base })).toMatchSnapshot();
  });
  it("IdentifierForm with database and social connections", () => {
    expect(
      renderHonoComponent(IdentifierForm, {
        ...base,
        client: clientWithConnections,
      }),
    ).toMatchSnapshot();
  });
  it("IdentifierForm with connections and error", () => {
    expect(
      renderHonoComponent(IdentifierForm, {
        ...base,
        client: clientWithConnections,
        error: "Invalid credentials",
      }),
    ).toMatchSnapshot();
  });
});
