/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import ChangeEmailForm from "../ChangeEmailForm";

const meta: Meta<typeof ChangeEmailForm> = {
  title: "Components/ChangeEmailForm",
  component: ChangeEmailForm,
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
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
  ),
};

export const WithError: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    error: "This email address is already in use.",
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
  ),
};

export const WithLongCurrentEmail: Story = {
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "very.long.current.email.address@example-company-domain.com",
    },
    client: mockClient,
    theme: null,
    branding: null,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
  ),
};

export const WithTheming: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: {
      colors: {
        primary_button: "#10b981",
        primary_button_label: "#ffffff",
        body_text: "#1f2937",
        widget_background: "#ffffff",
        widget_border: "#e5e7eb",
        header: "#111827",
        input_labels_placeholders: "#6b7280",
        input_border: "#d1d5db",
        base_hover_color: "#059669",
        links_focused_components: "#10b981",
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
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ChangeEmailForm, args)} />
  ),
};

export const DarkMode: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
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
  },
  parameters: {
    backgrounds: { default: "dark" },
  },
  render: (args) => (
    <HonoJSXWrapper
      html={`<div class="dark bg-gray-900 p-8">${renderHonoComponent(ChangeEmailForm, args)}</div>`}
    />
  ),
};
