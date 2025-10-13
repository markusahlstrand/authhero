/** @jsxImportSource react */
import type { Meta, StoryObj } from "@storybook/react";
import {
  HonoJSXWrapper,
  renderHonoComponent,
} from "../../storybook-utils/HonoJSXWrapper";
import EnterCodeForm from "../EnterCodeForm";

const meta: Meta<typeof EnterCodeForm> = {
  title: "Components/EnterCodeForm",
  component: EnterCodeForm,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

// Default story
export const Default: Story = {
  args: {
    email: "user@example.com",
    state: "mock-state-123",
    hasPasswordLogin: false,
    theme: null,
    branding: null,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(EnterCodeForm, args)} />
  ),
};

// Story with error
export const WithError: Story = {
  args: {
    ...Default.args,
    error: "Invalid verification code. Please try again.",
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(EnterCodeForm, args)} />
  ),
};

// Story with password login option
export const WithPasswordLogin: Story = {
  args: {
    ...Default.args,
    hasPasswordLogin: true,
  },
  render: (args) => (
    <HonoJSXWrapper html={renderHonoComponent(EnterCodeForm, args)} />
  ),
};
