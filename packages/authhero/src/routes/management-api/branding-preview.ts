/**
 * Sample screens for the full-page Universal Login preview.
 *
 * These mirror the shapes the screen registry produces at runtime, but with
 * static placeholder content so the preview endpoint can render a full page
 * without a real login session. They intentionally use inert `#` actions and
 * links — the preview is for visual layout, not interaction.
 */

export const PREVIEW_SCREEN_IDS = [
  "login",
  "identifier",
  "password",
  "signup",
] as const;

export type PreviewScreenId = (typeof PREVIEW_SCREEN_IDS)[number];

interface PreviewComponent {
  id: string;
  type: string;
  category: "FIELD" | "BLOCK" | "WIDGET";
  visible: boolean;
  label?: string;
  config?: Record<string, unknown>;
  required?: boolean;
  sensitive?: boolean;
  order: number;
}

interface PreviewScreen {
  name: string;
  action: string;
  method: string;
  title?: string;
  description?: string;
  components: PreviewComponent[];
  links?: Array<{
    id?: string;
    text: string;
    linkText?: string;
    href: string;
  }>;
}

const socialButtons: PreviewComponent = {
  id: "social-buttons",
  type: "SOCIAL",
  category: "FIELD",
  visible: true,
  config: { providers: ["google-oauth2"] },
  order: 0,
};

const divider: PreviewComponent = {
  id: "divider",
  type: "DIVIDER",
  category: "BLOCK",
  visible: true,
  order: 1,
};

const emailField: PreviewComponent = {
  id: "username",
  type: "EMAIL",
  category: "FIELD",
  visible: true,
  label: "Email address",
  config: { placeholder: "name@example.com" },
  required: true,
  order: 2,
};

function passwordField(order: number): PreviewComponent {
  return {
    id: "password",
    type: "PASSWORD",
    category: "FIELD",
    visible: true,
    label: "Password",
    config: { placeholder: "Enter your password" },
    required: true,
    sensitive: true,
    order,
  };
}

function submit(text: string, order: number): PreviewComponent {
  return {
    id: "submit",
    type: "NEXT_BUTTON",
    category: "BLOCK",
    visible: true,
    config: { text },
    order,
  };
}

/**
 * Build a sample screen object for the given preview screen id. Falls back to
 * the identifier/login screen for unknown ids.
 */
export function buildPreviewScreen(screenId: string): PreviewScreen {
  switch (screenId) {
    case "signup":
      return {
        name: "signup",
        action: "#",
        method: "POST",
        title: "Create account",
        description: "Sign up to get started",
        components: [
          socialButtons,
          divider,
          emailField,
          passwordField(3),
          submit("Sign up", 4),
        ],
        links: [
          {
            id: "login",
            text: "Already have an account?",
            linkText: "Sign in",
            href: "#",
          },
        ],
      };
    case "password":
      return {
        name: "login-password",
        action: "#",
        method: "POST",
        title: "Enter your password",
        description: "Signing in as <strong>user@example.com</strong>",
        components: [passwordField(0), submit("Continue", 1)],
        links: [
          {
            id: "forgot",
            text: "Forgot your password?",
            linkText: "Reset it",
            href: "#",
          },
        ],
      };
    case "login":
    case "identifier":
    default:
      return {
        name: "login-id",
        action: "#",
        method: "POST",
        title: "Welcome",
        description: "Sign in to continue",
        components: [socialButtons, divider, emailField, submit("Continue", 3)],
        links: [
          {
            id: "signup",
            text: "Don't have an account?",
            linkText: "Sign up",
            href: "#",
          },
        ],
      };
  }
}
