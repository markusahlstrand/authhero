/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import { USERNAME_PASSWORD_PROVIDER } from "../../constants";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import LoginForm from "../LoginForm";

const meta: Meta<typeof LoginForm> = {
  title: "Components/LoginForm",
  component: LoginForm,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const mockClient = {
  connections: [
    { name: "email", strategy: "email" },
    { name: USERNAME_PASSWORD_PROVIDER, strategy: "Username-Password-Authentication" },
  ],
} as any;

export const Default: Story = {
  args: {
    state: "example_state_123",
    email: "user@example.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: true,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
  ),
};

export const WithError: Story = {
  args: {
    state: "example_state_123",
    email: "user@example.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: true,
    error: "Invalid password. Please try again.",
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
  ),
};

export const WithoutCodeOption: Story = {
  args: {
    state: "example_state_123",
    email: "user@example.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: false,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
  ),
};

export const WithLongEmail: Story = {
  args: {
    state: "example_state_123",
    email: "very.long.email.address@example-company.com",
    client: mockClient,
    theme: null,
    branding: null,
    showCodeOption: true,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
  ),
};

export const WithTheming: Story = {
  args: {
    state: "example_state_123",
    email: "user@example.com",
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
    showCodeOption: true,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(LoginForm, args)} />
  ),
};

export const DarkMode: Story = {
  args: {
    state: "example_state_123",
    email: "user@example.com",
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
    showCodeOption: true,
  },
  parameters: {
    backgrounds: { default: "dark" },
  },
  render: (args) => (
    <HonoJSXWrapper
      html={`<div class="dark bg-gray-900 p-8">${renderHonoComponent(LoginForm, args)}</div>`}
    />
  ),
};
