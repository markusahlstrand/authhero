import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import EnterPasswordForm from "../EnterPasswordForm";
import type {
  Theme,
  Branding,
  LoginSession,
} from "@authhero/adapter-interfaces";
import type { EnrichedClient } from "../../helpers/client";
import {
  AuthorizationResponseType,
  LoginSessionState,
} from "@authhero/adapter-interfaces";
import i18next from "i18next";

// Initialize i18next for stories
i18next.init({
  lng: "en",
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        enter_password: "Enter your password",
        enter_password_description: "Enter your password to continue",
        email: "Email",
        password: "Password",
        password_placeholder: "Enter your password",
        forgot_password: "Forgot password?",
        continue: "Continue",
        back: "Back",
        toggle_password_visibility: "Toggle password visibility",
      },
    },
  },
});

// Define the props type for EnterPasswordForm
type EnterPasswordFormProps = {
  theme: Theme | null;
  branding: Branding | null;
  loginSession: LoginSession;
  email: string;
  client: EnrichedClient;
  error?: string;
};

const meta = {
  title: "Components/EnterPasswordForm",
  component: HonoJSXWrapper as any,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: `
# EnterPasswordForm

A modern password entry form component using shadcn/ui components with client-side password visibility toggle.

## Features

- 🎨 Fully themeable with custom colors, borders, and fonts
- 👁️ Password visibility toggle (powered by client-side hydration)
- ✅ Built-in error handling and validation
- 🔗 Forgot password link
- ⬅️ Back navigation
- 📱 Responsive design
- 🎯 Progressive enhancement - works without JavaScript

## Client-Side Enhancement

The password toggle button is enhanced with JavaScript after the page loads using Hono's JSX/DOM hydration:

1. Server renders the HTML with the toggle button
2. Client-side \`PasswordToggle\` component hydrates on load
3. Click handlers are attached via \`addEventListener\`
4. Password visibility can be toggled smoothly

The form works perfectly fine without JavaScript - the password field functions normally. The toggle is a progressive enhancement.
        `,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof HonoJSXWrapper>;

export default meta;
type Story = StoryObj<typeof meta>;

// Mock data
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
    body_text: {
      bold: false,
      size: 14,
    },
    buttons_text: {
      bold: true,
      size: 14,
    },
    font_url: "",
    input_labels: {
      bold: false,
      size: 14,
    },
    links: {
      bold: true,
      size: 14,
    },
    links_style: "normal",
    reference_text_size: 12,
    subtitle: {
      bold: false,
      size: 14,
    },
    title: {
      bold: true,
      size: 24,
    },
  },
  widget: {
    header_text_alignment: "center",
    logo_height: 52,
    logo_position: "center",
    logo_url: "http://acmelogos.com/images/logo-5.svg",
    social_buttons_layout: "bottom",
  },
};

const mockBranding: Branding = {
  logo_url: "http://acmelogos.com/images/logo-5.svg",
  colors: {
    primary: "#0066cc",
  },
};

const mockClient: EnrichedClient = {
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    friendly_name: "Test Tenant",
    audience: "https://test-tenant.authhero.com",
    sender_email: "noreply@authhero.com",
    sender_name: "AuthHero",
  },
  connections: [],
};

// Helper function to create story args
const createStoryArgs = (props: EnterPasswordFormProps): { html: string } => ({
  html: renderHonoComponent(EnterPasswordForm, props),
});

// Default story
export const Default: Story = {
  args: createStoryArgs({
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient,
  }),
};

// With error
export const WithError: Story = {
  args: createStoryArgs({
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient,
    error: "Invalid password. Please try again.",
  }),
};

// Dark theme
export const DarkTheme: Story = {
  args: createStoryArgs({
    theme: {
      ...mockTheme,
      colors: {
        ...mockTheme.colors,
        body_text: "#e5e7eb",
        header: "#f9fafb",
        input_background: "#1f2937",
        input_border: "#374151",
        input_filled_text: "#f9fafb",
        input_labels_placeholders: "#9ca3af",
        widget_background: "#111827",
        widget_border: "#374151",
        primary_button: "#3b82f6",
        primary_button_label: "#ffffff",
      },
    },
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient,
  }),
  parameters: {
    backgrounds: {
      default: "dark",
    },
  },
};

// Custom branding
export const CustomBranding: Story = {
  args: createStoryArgs({
    theme: {
      ...mockTheme,
      colors: {
        ...mockTheme.colors,
        primary_button: "#7c3aed",
        primary_button_label: "#ffffff",
        base_hover_color: "#6d28d9",
        links_focused_components: "#7c3aed",
      },
      borders: {
        ...mockTheme.borders,
        button_border_radius: 8,
        input_border_radius: 8,
        widget_corner_radius: 16,
      },
    },
    branding: {
      ...mockBranding,
      colors: {
        primary: "#7c3aed",
      },
    },
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient,
  }),
};

// No logo
export const NoLogo: Story = {
  args: createStoryArgs({
    theme: {
      ...mockTheme,
      widget: {
        ...mockTheme.widget,
        logo_position: "none",
      },
    },
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "user@example.com",
    client: mockClient,
  }),
};

// Long email address
export const LongEmail: Story = {
  args: createStoryArgs({
    theme: mockTheme,
    branding: mockBranding,
    loginSession: mockLoginSession,
    email: "very.long.email.address.that.might.overflow@subdomain.example.com",
    client: mockClient,
  }),
};
