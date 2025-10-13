/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import AccountForm from "../AccountForm";

const meta: Meta<typeof AccountForm> = {
  title: "Components/AccountForm",
  component: AccountForm,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockUser = {
  email: "user@example.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: "auth2|user_123",
  provider: "auth2",
  connection: "Username-Password-Authentication",
  is_social: false,
  email_verified: true,
  login_count: 15,
} as any;

const mockUserWithLinkedAccounts = {
  ...mockUser,
  identities: [
    {
      provider: "auth2",
      user_id: "user_123",
      connection: "Username-Password-Authentication",
      isSocial: false,
    },
    {
      provider: "google-oauth2",
      user_id: "google_123456",
      connection: "google-oauth2",
      isSocial: true,
      profileData: {
        email: "user@gmail.com",
      },
    },
    {
      provider: "github",
      user_id: "github_789",
      connection: "github",
      isSocial: true,
      profileData: {
        email: "user@github-account.com",
      },
    },
  ],
} as any;

const mockClient = {
  client_id: "client_123",
  connections: [{ name: "email", strategy: "email" }],
} as any;

export const Default: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
  ),
};

export const WithSuccess: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false,
    success: "Your email has been updated successfully!",
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
  ),
};

export const WithError: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false,
    error: "Failed to update email. Please try again.",
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
  ),
};

export const WithLinkedAccounts: Story = {
  args: {
    state: "example_state_123",
    user: mockUserWithLinkedAccounts,
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: true,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
  ),
};

export const WithLongEmail: Story = {
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "very.long.email.address.for.testing@example-company-domain.com",
    },
    client: mockClient,
    theme: null,
    branding: null,
    showLinkedAccounts: false,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
  ),
};

export const WithTheming: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#7c3aed",
        primary_button_label: "#ffffff",
        body_text: "#1f2937",
        widget_background: "#ffffff",
        widget_border: "#e5e7eb",
        header: "#111827",
        input_labels_placeholders: "#6b7280",
        input_border: "#d1d5db",
        base_hover_color: "#6d28d9",
        links_focused_components: "#7c3aed",
      },
      fonts: {
        title: { bold: true, size: 28 },
        body_text: { bold: false, size: 16 },
      },
      borders: {
        widget_corner_radius: 16,
        button_border_radius: 8,
        show_widget_shadow: true,
      },
      widget: {
        logo_position: "center",
      },
    } as any,
    branding: null,
    showLinkedAccounts: false,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(AccountForm, args)} />
  ),
};

export const DarkMode: Story = {
  args: {
    state: "example_state_123",
    user: mockUserWithLinkedAccounts,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#3b82f6",
        primary_button_label: "#ffffff",
        body_text: "#e5e7eb",
        widget_background: "#1f2937",
        widget_border: "#374151",
        header: "#f9fafb",
        input_labels_placeholders: "#9ca3af",
        input_border: "#4b5563",
        base_hover_color: "#2563eb",
        links_focused_components: "#60a5fa",
      },
      fonts: {
        title: { bold: true, size: 24 },
        body_text: { bold: false, size: 14 },
      },
      borders: {
        widget_corner_radius: 8,
        button_border_radius: 4,
        show_widget_shadow: true,
      },
      widget: {
        logo_position: "center",
      },
    } as any,
    branding: null,
    showLinkedAccounts: true,
  },
  parameters: {
    backgrounds: { default: "dark" },
  },
  render: (args) => (
    <HonoJSXWrapper
      html={`<div class="dark bg-gray-900 p-8">${renderHonoComponent(AccountForm, args)}</div>`}
    />
  ),
};
