/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import ContinueForm from "../ContinueForm";

const meta: Meta<typeof ContinueForm> = {
  title: "Components/ContinueForm",
  component: ContinueForm,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockUser = {
  email: "john.doe@example.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: "user_123",
  provider: "email",
  connection: "email",
  is_social: false,
  email_verified: true,
  login_count: 5,
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
    <HonoJSXWrapper html={renderHonoComponent(ContinueForm, args)} />
  ),
};

export const WithCustomUser: Story = {
  args: {
    state: "example_state_123",
    user: {
      ...mockUser,
      email: "custom.user@company.com",
    },
    client: mockClient,
    theme: null,
    branding: null,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(ContinueForm, args)} />
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
    <HonoJSXWrapper html={renderHonoComponent(ContinueForm, args)} />
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
      html={`<div class="dark bg-gray-900 p-8">${renderHonoComponent(ContinueForm, args)}</div>`}
    />
  ),
};
