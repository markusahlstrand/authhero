/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import IdentifierPage from "../IdentifierPage";
import type {
  LoginSession,
  Theme,
  Branding,
} from "@authhero/adapter-interfaces";
import type { EnrichedClient } from "../../helpers/client";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";

// Mock data for stories
const mockLoginSession: LoginSession = {
  id: "mock-session-id",
  authParams: {
    client_id: "mock-client-id",
    redirect_uri: "http://localhost:3000/callback",
    response_type: AuthorizationResponseType.CODE,
    scope: "openid profile email",
    state: "mock-state",
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
  csrf_token: "mock-csrf-token",
  state: LoginSessionState.PENDING,
};

const mockTheme: Theme = {
  themeId: "mock-theme",
  displayName: "Default Theme",
  page_background: {
    background_color: "#ffffff",
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
    success: "#16a34a",
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
    title: { bold: true, size: 24 },
    subtitle: { bold: false, size: 16 },
    body_text: { bold: false, size: 14 },
    buttons_text: { bold: true, size: 14 },
    input_labels: { bold: false, size: 14 },
    links: { bold: false, size: 14 },
    font_url: "",
    links_style: "underlined",
    reference_text_size: 14,
  },
  widget: {
    logo_url: "http://acmelogos.com/images/logo-5.svg",
    header_text_alignment: "center",
    logo_height: 52,
    logo_position: "center",
    social_buttons_layout: "bottom",
  },
};

const mockBranding: Branding = {
  logo_url: "http://acmelogos.com/images/logo-5.svg",
  powered_by_logo_url: "http://acmelogos.com/images/logo-5.svg",
  colors: {
    primary: "#0066cc",
  },
};

const createMockClient = (connections: string[]): EnrichedClient => ({
  name: "Mock Application",
  client_id: "mock-client-id",
  global: false,
  is_first_party: false,
  oidc_conformant: true,
  auth0_conformant: true,
  sso: false,
  sso_disabled: false,
  cross_origin_authentication: false,
  custom_login_page_on: false,
  require_pushed_authorization_requests: false,
  require_proof_of_possession: false,
  tenant: {
    id: "mock-tenant-id",
    friendly_name: "Mock Tenant",
    audience: "mock-audience",
    sender_email: "noreply@example.com",
    sender_name: "Mock App",
    support_url: "https://example.com/support",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  connections: connections.map((strategy) => ({
    id: `${strategy}-id`,
    name: strategy,
    strategy,
    options: {},
    enabled_clients: ["mock-client-id"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })),
  callbacks: ["http://localhost:3000/callback"],
  allowed_logout_urls: ["http://localhost:3000"],
  web_origins: ["http://localhost:3000"],
  client_secret: "mock-secret",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const meta = {
  title: "Components/IdentifierPage",
  component: IdentifierPage,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof IdentifierPage>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story: Email only login
export const EmailOnly: Story = {
  render: (args) => {
    const html = renderHonoComponent(IdentifierPage, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
  },
};

// Story: Email with error
export const EmailWithError: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
    error: "Invalid email address",
    email: "test@example.com",
  },
};

// Story: Phone only login
export const PhoneOnly: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"]),
  },
};

// Story: Email or Phone
export const EmailOrPhone: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "sms"]),
  },
};

// Story: Email with Google login
export const EmailWithGoogle: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
};

// Story: Email with all social logins
export const EmailWithAllSocial: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient([
      "email",
      "google-oauth2",
      "facebook",
      "apple",
      "vipps",
    ]),
  },
};

// Story: Social logins only (no form)
export const SocialOnly: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["google-oauth2", "facebook", "apple"]),
  },
};

// Story: Username-Password-Authentication (Auth0 style)
export const UsernamePassword: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["Username-Password-Authentication"]),
  },
};

// Story: No theme or branding
export const NoTheming: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierPage, args)} />
  ),
  args: {
    theme: null,
    branding: null,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
};

// Story: Custom color theme
export const CustomColors: Story = {
  render: (args) => {
    const html = renderHonoComponent(IdentifierPage, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: {
      ...mockTheme,
      themeId: "custom-theme",
      displayName: "Purple Theme",
      colors: {
        ...mockTheme.colors,
        primary_button: "#7c3aed",
        primary_button_label: "#ffffff",
        links_focused_components: "#7c3aed",
      },
    },
    branding: {
      logo_url:
        "https://via.placeholder.com/200x60/7c3aed/ffffff?text=Custom+Logo",
      colors: {
        primary: "#7c3aed",
      },
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2", "apple"]),
  },
};
