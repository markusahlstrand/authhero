/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  HonoFullPageWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import IdentifierForm from "../IdentifierForm";
import AuthLayout from "../AuthLayout";
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

const purpleTheme: Theme = {
  ...mockTheme,
  themeId: "purple-theme",
  displayName: "Purple Theme",
  colors: {
    ...mockTheme.colors,
    primary_button: "#7c3aed",
    primary_button_label: "#ffffff",
    base_hover_color: "#6d28d9",
    base_focus_color: "#7c3aed",
    links_focused_components: "#7c3aed",
    header: "#6d28d9",
    widget_background: "#faf5ff",
    widget_border: "#e9d5ff",
  },
};

const darkTheme: Theme = {
  ...mockTheme,
  themeId: "dark-theme",
  displayName: "Dark Theme",
  colors: {
    ...mockTheme.colors,
    primary_button: "#3b82f6",
    primary_button_label: "#ffffff",
    base_hover_color: "#2563eb",
    body_text: "#e5e7eb",
    header: "#f3f4f6",
    input_background: "#1f2937",
    input_border: "#374151",
    input_filled_text: "#f3f4f6",
    input_labels_placeholders: "#9ca3af",
    widget_background: "#111827",
    widget_border: "#374151",
  },
};

const pillTheme: Theme = {
  ...mockTheme,
  themeId: "pill-theme",
  displayName: "Pill Style Theme",
  borders: {
    ...mockTheme.borders,
    button_border_radius: 24,
    input_border_radius: 24,
    widget_corner_radius: 24,
    buttons_style: "pill",
    inputs_style: "pill",
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
  title: "Components/IdentifierForm",
  component: IdentifierForm,
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "light",
      values: [
        { name: "light", value: "#ffffff" },
        { name: "gray", value: "#f3f4f6" },
        { name: "dark", value: "#1f2937" },
      ],
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof IdentifierForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story: Default theme
export const Default: Story = {
  render: (args) => {
    const html = renderHonoComponent(IdentifierForm, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
};

// Story: With error
export const WithError: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
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

// Story: Purple theme
export const PurpleTheme: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
  ),
  args: {
    theme: purpleTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
  parameters: {
    backgrounds: { default: "light" },
  },
};

// Story: Dark theme
export const DarkTheme: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
  ),
  args: {
    theme: darkTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
  parameters: {
    backgrounds: { default: "dark" },
  },
};

// Story: Pill style
export const PillStyle: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
  ),
  args: {
    theme: pillTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["email"]),
  },
};

// Story: Only branding (no theme)
export const BrandingOnly: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
  ),
  args: {
    branding: {
      logo_url: "http://acmelogos.com/images/logo-5.svg",
      colors: {
        primary: "#ec4899", // pink
      },
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
};

// Story: Phone only
export const PhoneOnly: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
  ),
  args: {
    theme: mockTheme,
    loginSession: mockLoginSession,
    client: createMockClient(["sms"]),
  },
};

// Story: No theme or branding
export const NoTheming: Story = {
  render: (args) => {
    const html = renderHonoComponent(IdentifierForm, args);
    return <HonoJSXWrapper html={html} />;
  },
  args: {
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
    email: "",
  },
};

// Story: Custom Google Font via Theme
// Note: To load custom fonts, use AuthLayout which includes the <head> section
// This story uses AuthLayout to demonstrate font loading
export const CustomGoogleFont: Story = {
  render: (args) => {
    const { theme, ...formArgs } = args;

    const form = IdentifierForm(formArgs);
    const layout = AuthLayout({
      theme,
      title: "Login",
      children: form,
    });

    const html = layout.toString();
    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    theme: {
      ...mockTheme,
      fonts: {
        ...mockTheme.fonts,
        font_url:
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap",
      },
    },
    branding: {
      logo_url: "http://acmelogos.com/images/logo-5.svg",
      colors: {
        primary: "#0066cc",
      },
    },
    loginSession: mockLoginSession,
    client: createMockClient(["email", "google-oauth2"]),
  },
  parameters: {
    docs: {
      description: {
        story:
          "This story demonstrates using a custom Google Font (Inter) via theme.fonts.font_url. The font is loaded in the AuthLayout <head> section and applied via CSS. Note: To load custom fonts, you need to use AuthLayout which includes the <head> section for loading external stylesheets.",
      },
    },
  },
};

// Story: Multiple Social Connections
export const MultipleSocialConnections: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
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
      "github",
      "microsoft",
    ]),
  },
  parameters: {
    docs: {
      description: {
        story:
          "This story demonstrates dynamically rendering multiple social login buttons based on available connections. The component now supports Google, Facebook, Apple, GitHub, Microsoft, and Vipps.",
      },
    },
  },
};

// Story: Developer-Focused Social Logins
export const DeveloperSocialLogins: Story = {
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(IdentifierForm, args)} />
  ),
  args: {
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    client: createMockClient(["email", "github", "microsoft"]),
  },
  parameters: {
    docs: {
      description: {
        story:
          "This story showcases GitHub and Microsoft authentication options, perfect for developer-focused applications.",
      },
    },
  },
};
