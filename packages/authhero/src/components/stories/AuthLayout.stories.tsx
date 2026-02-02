/** @jsxImportSource react */
import { Meta, StoryObj } from "@storybook/react";
import { HonoFullPageWrapper } from "../../storybook-utils/HonoJSXWrapper";
import AuthLayout from "../AuthLayout";
import IdentifierForm from "../IdentifierForm";
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

const leftLayoutTheme: Theme = {
  ...mockTheme,
  themeId: "left-layout",
  displayName: "Left Layout Theme",
  page_background: {
    background_color: "#f3f4f6",
    background_image_url: "",
    page_layout: "left",
  },
  widget: {
    ...mockTheme.widget,
    logo_position: "left",
  },
};

const rightLayoutTheme: Theme = {
  ...mockTheme,
  themeId: "right-layout",
  displayName: "Right Layout Theme",
  page_background: {
    background_color: "#f3f4f6",
    background_image_url: "",
    page_layout: "right",
  },
  widget: {
    ...mockTheme.widget,
    logo_position: "right",
  },
};

const gradientBackgroundTheme: Theme = {
  ...mockTheme,
  themeId: "gradient-bg",
  displayName: "Gradient Background Theme",
  page_background: {
    background_color: "#7c3aed",
    background_image_url: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    page_layout: "center",
  },
  colors: {
    ...mockTheme.colors,
    primary_button: "#7c3aed",
    base_hover_color: "#6d28d9",
  },
};

const imageBackgroundTheme: Theme = {
  ...mockTheme,
  themeId: "image-bg",
  displayName: "Image Background Theme",
  page_background: {
    background_color: "#1f2937",
    background_image_url:
      "https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&h=1080&fit=crop",
    page_layout: "center",
  },
  colors: {
    ...mockTheme.colors,
    widget_background: "rgba(255, 255, 255, 0.95)",
  },
};

const darkTheme: Theme = {
  ...mockTheme,
  themeId: "dark-theme",
  displayName: "Dark Theme",
  page_background: {
    background_color: "#0f172a",
    background_image_url: "",
    page_layout: "center",
  },
  colors: {
    ...mockTheme.colors,
    primary_button: "#3b82f6",
    primary_button_label: "#ffffff",
    base_hover_color: "#2563eb",
    body_text: "#e5e7eb",
    header: "#f3f4f6",
    input_background: "#1e293b",
    input_border: "#334155",
    input_filled_text: "#f3f4f6",
    input_labels_placeholders: "#94a3b8",
    widget_background: "#1e293b",
    widget_border: "#334155",
  },
  widget: {
    ...mockTheme.widget,
    logo_url: "http://acmelogos.com/images/logo-5.svg",
  },
};

const mockBranding: Branding = {
  logo_url: "http://acmelogos.com/images/logo-5.svg",
  powered_by_logo_url: "http://acmelogos.com/images/logo-5.svg",
  colors: {
    primary: "#0066cc",
  },
};

const mockBrandingWithoutPoweredBy: Branding = {
  logo_url: "http://acmelogos.com/images/logo-5.svg",
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
  title: "Layouts/AuthLayout",
  component: AuthLayout,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

// Story: Center layout (default)
export const CenterLayout: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"]),
    });

    const layout = AuthLayout({
      title: "Sign In",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In",
    theme: mockTheme,
    branding: mockBranding,
  },
};

// Story: Left layout
export const LeftLayout: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"]),
    });

    const layout = AuthLayout({
      title: "Sign In - Left Aligned",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Left Aligned",
    theme: leftLayoutTheme,
    branding: mockBrandingWithoutPoweredBy,
  },
};

// Story: Right layout
export const RightLayout: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"]),
    });

    const layout = AuthLayout({
      title: "Sign In - Right Aligned",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Right Aligned",
    theme: rightLayoutTheme,
    branding: mockBrandingWithoutPoweredBy,
  },
};

// Story: Gradient background
export const GradientBackground: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"]),
    });

    const layout = AuthLayout({
      title: "Sign In - Gradient Background",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Gradient Background",
    theme: gradientBackgroundTheme,
    branding: mockBrandingWithoutPoweredBy,
  },
};

// Story: Image background
export const ImageBackground: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email"]),
    });

    const layout = AuthLayout({
      title: "Sign In - Image Background",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Image Background",
    theme: imageBackgroundTheme,
    branding: mockBrandingWithoutPoweredBy,
  },
};

// Story: Dark theme
export const DarkTheme: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email", "google-oauth2"]),
    });

    const layout = AuthLayout({
      title: "Sign In - Dark Theme",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Dark Theme",
    theme: darkTheme,
    branding: mockBrandingWithoutPoweredBy,
  },
};

// Story: No logo
export const NoLogo: Story = {
  render: (args) => {
    // Render IdentifierForm inside AuthLayout using Hono JSX
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email"]),
    });

    const layout = AuthLayout({
      title: "Sign In - No Logo",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - No Logo",
    theme: {
      ...mockTheme,
      widget: {
        ...mockTheme.widget,
        logo_position: "none",
      },
    },
    branding: mockBrandingWithoutPoweredBy,
  },
};

// Story: Multiple forms (showing layout flexibility)
export const MultipleComponents: Story = {
  render: (args) => {
    // For MultipleComponents, we'll just show a single form
    // The original intent was to demonstrate layout flexibility,
    // but due to JSX runtime limitations, we keep it simple
    const form = IdentifierForm({
      theme: args.theme,
      branding: args.branding,
      loginSession: mockLoginSession,
      client: createMockClient(["email"]),
    });

    const layout = AuthLayout({
      title: "Sign In - Layout Flexibility",
      theme: args.theme,
      branding: args.branding,
      children: form,
    });

    // Convert to HTML string
    const html = layout.toString();

    return <HonoFullPageWrapper html={html} />;
  },
  args: {
    title: "Sign In - Layout Flexibility",
    theme: mockTheme,
    branding: mockBrandingWithoutPoweredBy,
  },
};
