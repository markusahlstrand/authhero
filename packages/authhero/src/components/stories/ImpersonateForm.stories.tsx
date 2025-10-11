/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import ImpersonateForm from "../ImpersonateForm";

const meta: Meta<typeof ImpersonateForm> = {
  title: "Components/ImpersonateForm",
  component: ImpersonateForm,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockUser = {
  email: "admin@example.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: "admin_user_123",
  provider: "email",
  connection: "email",
  is_social: false,
  email_verified: true,
  login_count: 42,
} as any;

const mockClient = {
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
    <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
  ),
};

export const WithError: Story = {
  args: {
    state: "example_state_123",
    user: mockUser,
    client: mockClient,
    theme: null,
    branding: null,
    error: 'User with ID "user_456" not found.',
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
  ),
};

export const WithCustomUser: Story = {
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "superadmin@company.com",
      user_id: "superadmin_789",
    },
    client: mockClient,
    theme: null,
    branding: null,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
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
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ImpersonateForm, args)} />
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
      html={`<div class="dark bg-gray-900 p-8">${renderHonoComponent(ImpersonateForm, args)}</div>`}
    />
  ),
};
