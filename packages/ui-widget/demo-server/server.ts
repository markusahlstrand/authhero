/**
 * Demo Hono Server for AuthHero Widget
 *
 * This server demonstrates the widget in a realistic setup:
 * - Serves the widget page at /u2/login/identifier
 * - Provides screen API at /u2/screen/:screenId (GET and POST)
 * - Handles the full login flow with mock data
 *
 * Run with: npx tsx demo-server/server.ts
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import type { UiScreen, FormComponent } from "../src/types/components";
import { renderToString } from "../hydrate";

// ============================================
// Types
// ============================================

interface SessionState {
  email?: string;
  username?: string;
  codeId?: string;
  authenticated: boolean;
}

interface ScreenBranding {
  logo_url?: string;
  colors?: {
    primary?: string;
    page_background?: string;
  };
}

interface ScreenResponse {
  screen: UiScreen;
  branding?: ScreenBranding;
}

interface PostResponse {
  redirect?: string;
  screen?: UiScreen;
  branding?: ScreenBranding;
}

// Dynamic settings passed via query params
interface DynamicSettings {
  strategy: "code" | "password";
  showSocial: boolean;
  allowSignup: boolean;
  socialProviders: string[];
}

// ============================================
// Demo Settings (defaults)
// ============================================

const defaultSettings = {
  strategy: "code" as "code" | "password",
  showSocial: true,
  allowSignup: true,
  brandColor: "#667eea",
};

// In-memory session storage (for demo purposes)
const sessions = new Map<string, SessionState>();

function getSession(state: string): SessionState {
  if (!sessions.has(state)) {
    sessions.set(state, { authenticated: false });
  }
  return sessions.get(state)!;
}

// Parse settings from query params
function parseSettings(
  query: Record<string, string | undefined>,
): DynamicSettings {
  // Parse providers from query param (comma-separated) or use default
  const defaultProviders = ["google-oauth2"];
  const providers = query.providers
    ? query.providers.split(",").map((p) => p.trim())
    : defaultProviders;

  return {
    strategy: query.strategy === "password" ? "password" : "code",
    showSocial: query.showSocial !== "false",
    allowSignup: query.allowSignup !== "false",
    socialProviders: providers,
  };
}

// Validate renderMode to prevent XSS - only allow "client" or "ssr"
function parseRenderMode(value: string | undefined): "client" | "ssr" {
  return value === "ssr" ? "ssr" : "client";
}

// ============================================
// Screen Builders
// ============================================

function buildSocialButtons(settings: DynamicSettings): FormComponent[] {
  if (!settings.showSocial || settings.socialProviders.length === 0) return [];

  return [
    {
      id: "social-buttons",
      type: "SOCIAL",
      category: "FIELD",
      visible: true,
      config: {
        providers: settings.socialProviders,
      },
      order: 0,
    },
    {
      id: "divider",
      type: "DIVIDER",
      category: "BLOCK",
      visible: true,
      order: 1,
    },
  ];
}

function createIdentifierScreen(
  state: string,
  baseUrl: string,
  settings: DynamicSettings,
): UiScreen {
  const socialButtons = buildSocialButtons(settings);
  const socialCount = socialButtons.length;

  return {
    action: `${baseUrl}/u2/screen/identifier?state=${state}`,
    method: "POST",
    title: "Welcome",
    description: "Log in to sesamy-test to continue to All Applications.",
    components: [
      ...socialButtons,
      {
        id: "username",
        type: "EMAIL",
        category: "FIELD",
        visible: true,
        label: "Email address",
        config: {
          placeholder: "name@example.com",
        },
        required: true,
        order: socialCount + 1,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Continue",
        },
        order: socialCount + 2,
      },
    ],
    links: settings.allowSignup
      ? [
          {
            id: "signup",
            text: "Don't have an account?",
            linkText: "Sign up",
            href: `${baseUrl}/u2/signup?state=${state}`,
          },
        ]
      : [],
  };
}

function createEnterPasswordScreen(
  state: string,
  baseUrl: string,
  email?: string,
): UiScreen {
  return {
    action: `${baseUrl}/u2/screen/enter-password?state=${state}`,
    method: "POST",
    title: "Enter your password",
    components: [
      ...(email
        ? [
            {
              id: "email-display",
              type: "RICH_TEXT" as const,
              category: "BLOCK" as const,
              visible: true,
              config: {
                content: `Signing in as <strong>${email}</strong>`,
              },
              order: 0,
            },
          ]
        : []),
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Password",
        config: {
          placeholder: "Enter your password",
        },
        required: true,
        sensitive: true,
        order: 1,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Continue",
        },
        order: 2,
      },
    ],
    links: [
      {
        id: "forgot-password",
        text: "Forgot your password?",
        linkText: "Reset it",
        href: `${baseUrl}/u2/forgot-password?state=${state}`,
      },
      {
        id: "back",
        text: "Not your account?",
        linkText: "Go back",
        href: `${baseUrl}/u2/login/identifier?state=${state}`,
      },
    ],
  };
}

function createEnterCodeScreen(
  state: string,
  baseUrl: string,
  email?: string,
): UiScreen {
  const maskedEmail = email
    ? email.replace(/(.{2})(.*)(@.*)/, "$1***$3")
    : "your email";

  return {
    action: `${baseUrl}/u2/screen/enter-code?state=${state}`,
    method: "POST",
    title: "Check your email",
    description: "Enter the verification code",
    components: [
      {
        id: "info",
        type: "RICH_TEXT",
        category: "BLOCK",
        visible: true,
        config: {
          content: `We sent a code to <strong>${maskedEmail}</strong>. Enter it below to continue.`,
        },
        order: 0,
      },
      {
        id: "code",
        type: "TEXT",
        category: "FIELD",
        visible: true,
        label: "Verification code",
        config: {
          placeholder: "Enter 6-digit code",
          max_length: 6,
        },
        required: true,
        order: 1,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Continue",
        },
        order: 2,
      },
      {
        id: "resend",
        type: "RESEND_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Resend code",
        },
        order: 3,
      },
    ],
    links: [
      {
        id: "back",
        text: "Not your email?",
        linkText: "Go back",
        href: `${baseUrl}/u2/login/identifier?state=${state}`,
      },
    ],
  };
}

function createSignupScreen(
  state: string,
  baseUrl: string,
  settings: DynamicSettings,
): UiScreen {
  const socialButtons = buildSocialButtons(settings);

  return {
    action: `${baseUrl}/u2/screen/signup?state=${state}`,
    method: "POST",
    title: "Create your account",
    components: [
      ...socialButtons,
      {
        id: "email",
        type: "EMAIL",
        category: "FIELD",
        visible: true,
        label: "Email address",
        config: {
          placeholder: "name@example.com",
        },
        required: true,
        order: socialButtons.length + 1,
      },
      {
        id: "password",
        type: "PASSWORD",
        category: "FIELD",
        visible: true,
        label: "Password",
        hint: "Must be at least 8 characters",
        config: {
          placeholder: "Create a password",
          min_length: 8,
        },
        required: true,
        order: socialButtons.length + 2,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Create account",
        },
        order: socialButtons.length + 3,
      },
    ],
    links: [
      {
        id: "login",
        text: "Already have an account?",
        linkText: "Sign in",
        href: `${baseUrl}/u2/login/identifier?state=${state}`,
      },
    ],
  };
}

function createForgotPasswordScreen(state: string, baseUrl: string): UiScreen {
  return {
    action: `${baseUrl}/u2/screen/forgot-password?state=${state}`,
    method: "POST",
    title: "Reset your password",
    description: "Enter your email to receive a reset link",
    components: [
      {
        id: "email",
        type: "EMAIL",
        category: "FIELD",
        visible: true,
        label: "Email address",
        config: {
          placeholder: "name@example.com",
        },
        required: true,
        order: 0,
      },
      {
        id: "submit",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Send reset link",
        },
        order: 1,
      },
    ],
    links: [
      {
        id: "back",
        text: "Remember your password?",
        linkText: "Sign in",
        href: `${baseUrl}/u2/login/identifier?state=${state}`,
      },
    ],
  };
}

function createSuccessScreen(
  state: string,
  baseUrl: string,
  email?: string,
): UiScreen {
  return {
    action: `${baseUrl}/callback?code=demo_auth_code&state=${state}`,
    method: "GET",
    title: "Welcome back!",
    description: email ? `Successfully signed in as ${email}` : "Success!",
    components: [
      {
        id: "success-message",
        type: "RICH_TEXT",
        category: "BLOCK",
        visible: true,
        config: {
          content: "✓ You have been successfully authenticated.",
        },
        order: 0,
      },
      {
        id: "continue",
        type: "NEXT_BUTTON",
        category: "BLOCK",
        visible: true,
        config: {
          text: "Continue to Application",
        },
        order: 1,
      },
    ],
    messages: [{ text: "Authentication successful!", type: "success" }],
  };
}

function screenWithError(
  screen: UiScreen,
  fieldId: string,
  errorMessage: string,
  screenMessage?: string,
): UiScreen {
  const updatedComponents = screen.components.map((c) => {
    if (c.id === fieldId) {
      return {
        ...c,
        messages: [{ text: errorMessage, type: "error" as const }],
      };
    }
    return c;
  });

  return {
    ...screen,
    components: updatedComponents,
    messages: screenMessage
      ? [{ text: screenMessage, type: "error" as const }]
      : screen.messages,
  };
}

// ============================================
// Screen Getters
// ============================================

function getScreen(
  screenId: string,
  state: string,
  baseUrl: string,
  settings: DynamicSettings,
): ScreenResponse | null {
  const session = getSession(state);
  const branding: ScreenBranding = {
    colors: { primary: defaultSettings.brandColor },
  };

  switch (screenId) {
    case "identifier":
      return {
        screen: createIdentifierScreen(state, baseUrl, settings),
        branding,
      };
    case "identifier-social": {
      // Override settings to use 3 social providers
      const socialSettings = {
        ...settings,
        socialProviders: ["google-oauth2", "facebook", "apple"],
      };
      return {
        screen: createIdentifierScreen(state, baseUrl, socialSettings),
        branding,
      };
    }
    case "enter-password":
      return {
        screen: createEnterPasswordScreen(state, baseUrl, session.email),
        branding,
      };
    case "enter-code":
      return {
        screen: createEnterCodeScreen(state, baseUrl, session.email),
        branding,
      };
    case "signup":
      return { screen: createSignupScreen(state, baseUrl, settings), branding };
    case "forgot-password":
      return { screen: createForgotPasswordScreen(state, baseUrl), branding };
    case "success":
      return {
        screen: createSuccessScreen(state, baseUrl, session.email),
        branding,
      };
    default:
      return null;
  }
}

// ============================================
// POST Handlers
// ============================================

function handleIdentifierPost(
  data: Record<string, unknown>,
  state: string,
  baseUrl: string,
  settings: DynamicSettings,
): PostResponse {
  const username = (data.username as string)?.toLowerCase()?.trim();
  const session = getSession(state);

  if (!username) {
    const screen = createIdentifierScreen(state, baseUrl, settings);
    return {
      screen: screenWithError(screen, "username", "Email is required"),
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(username)) {
    const screen = createIdentifierScreen(state, baseUrl, settings);
    return {
      screen: screenWithError(
        screen,
        "username",
        "Please enter a valid email address",
      ),
    };
  }

  // Store email in session
  session.email = username;
  session.username = username;

  // Determine next screen based on strategy
  if (settings.strategy === "password") {
    return { redirect: `${baseUrl}/u2/enter-password?state=${state}` };
  }

  // Code-based login - generate mock OTP
  session.codeId = Math.floor(100000 + Math.random() * 900000).toString();
  console.log(`📧 Mock OTP code for ${username}: ${session.codeId}`);

  return { redirect: `${baseUrl}/u2/enter-code?state=${state}` };
}

function handleEnterPasswordPost(
  data: Record<string, unknown>,
  state: string,
  baseUrl: string,
): PostResponse {
  const password = data.password as string;
  const session = getSession(state);

  if (!password) {
    const screen = createEnterPasswordScreen(state, baseUrl, session.email);
    return {
      screen: screenWithError(screen, "password", "Password is required"),
    };
  }

  if (password.length < 6) {
    const screen = createEnterPasswordScreen(state, baseUrl, session.email);
    return {
      screen: screenWithError(
        screen,
        "password",
        "Invalid password",
        "The email or password is incorrect.",
      ),
    };
  }

  // Success!
  session.authenticated = true;
  return { redirect: `${baseUrl}/callback?code=demo_auth_code&state=${state}` };
}

function handleEnterCodePost(
  data: Record<string, unknown>,
  state: string,
  baseUrl: string,
): PostResponse {
  const code = (data.code as string)?.trim();
  const session = getSession(state);

  if (!code) {
    const screen = createEnterCodeScreen(state, baseUrl, session.email);
    return {
      screen: screenWithError(screen, "code", "Code is required"),
    };
  }

  if (code.length !== 6) {
    const screen = createEnterCodeScreen(state, baseUrl, session.email);
    return {
      screen: screenWithError(screen, "code", "Please enter a 6-digit code"),
    };
  }

  // For demo, accept any 6-digit code
  session.authenticated = true;
  return { redirect: `${baseUrl}/callback?code=demo_auth_code&state=${state}` };
}

function handleSignupPost(
  data: Record<string, unknown>,
  state: string,
  baseUrl: string,
  settings: DynamicSettings,
): PostResponse {
  const email = (data.email as string)?.toLowerCase()?.trim();
  const password = data.password as string;
  const session = getSession(state);

  if (!email) {
    const screen = createSignupScreen(state, baseUrl, settings);
    return {
      screen: screenWithError(screen, "email", "Email is required"),
    };
  }

  if (!password || password.length < 8) {
    const screen = createSignupScreen(state, baseUrl, settings);
    return {
      screen: screenWithError(
        screen,
        "password",
        "Password must be at least 8 characters",
      ),
    };
  }

  session.email = email;
  session.authenticated = true;

  return { redirect: `${baseUrl}/callback?code=demo_auth_code&state=${state}` };
}

function handleForgotPasswordPost(
  data: Record<string, unknown>,
  state: string,
  baseUrl: string,
): PostResponse {
  const email = (data.email as string)?.toLowerCase()?.trim();

  if (!email) {
    const screen = createForgotPasswordScreen(state, baseUrl);
    return {
      screen: screenWithError(screen, "email", "Email is required"),
    };
  }

  console.log(`📧 Password reset requested for: ${email}`);

  // Return success message
  const screen = createForgotPasswordScreen(state, baseUrl);
  return {
    screen: {
      ...screen,
      messages: [
        {
          text: `If an account exists for ${email}, you will receive a reset link.`,
          type: "success",
        },
      ],
    },
  };
}

// ============================================
// Widget Page HTML
// ============================================

async function renderWidgetPage(options: {
  screenId: string;
  state: string;
  baseUrl: string;
  urlMode: "path" | "query";
  providers?: string;
  renderMode?: "client" | "ssr";
}): Promise<string> {
  const {
    screenId,
    state,
    baseUrl,
    urlMode,
    providers,
    renderMode = "client",
  } = options;

  // Pre-render widget HTML if SSR mode
  let prerenderedWidgetHtml = "";
  if (renderMode === "ssr") {
    // Get the initial screen data to pre-render
    const settings = parseSettings({
      providers: providers || "google-oauth2",
      strategy: "code",
      showSocial: "true",
      allowSignup: "true",
    });

    // Get the screen config based on screenId
    let screen: UiScreen;
    switch (screenId) {
      case "identifier":
      case "identifier-social":
        screen = createIdentifierScreen(state, baseUrl, settings);
        break;
      case "enter-password":
        screen = createEnterPasswordScreen(state, baseUrl);
        break;
      case "enter-code":
        screen = createEnterCodeScreen(state, baseUrl);
        break;
      case "signup":
        screen = createSignupScreen(state, baseUrl, settings);
        break;
      case "forgot-password":
        screen = createForgotPasswordScreen(state, baseUrl);
        break;
      default:
        screen = createIdentifierScreen(state, baseUrl, settings);
    }

    const screenJson = JSON.stringify(screen).replace(/'/g, "&#39;");

    try {
      const result = await renderToString(
        `<authhero-widget 
          id="widget" 
          screen='${screenJson}'
          auto-submit="true"
          auto-navigate="true"
        ></authhero-widget>`,
        {
          fullDocument: false,
          serializeShadowRoot: "declarative-shadow-dom",
        },
      );
      prerenderedWidgetHtml = result.html || "";
    } catch (err) {
      console.error("SSR render error:", err);
      // Fall back to client-side rendering
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AuthHero Widget Demo</title>
  <script type="module" src="/widget/authhero-widget/authhero-widget.esm.js"></script>
  <style>
    :root {
      --primary-color: ${defaultSettings.brandColor};
      --bg-gradient-start: ${defaultSettings.brandColor};
      --bg-gradient-end: #764ba2;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      overflow: hidden;
    }
    body {
      display: flex;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    /* Settings Panel */
    .settings-panel {
      width: 320px;
      min-width: 320px;
      height: 100vh;
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 1.5rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      border-right: 1px solid #2d2d44;
      flex-shrink: 0;
    }
    .settings-panel h1 {
      font-size: 1.25rem;
      color: white;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .settings-panel h1::before {
      content: '⚙️';
    }
    .settings-section {
      background: #252540;
      border-radius: 8px;
      padding: 1rem;
    }
    .settings-section h3 {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #9ca3af;
      margin-bottom: 0.75rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #3d3d5c;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
    }
    .settings-section h3::after {
      content: '▼';
      font-size: 0.6rem;
      transition: transform 0.2s ease;
    }
    .settings-section.collapsed h3::after {
      transform: rotate(-90deg);
    }
    .settings-section-content {
      transition: max-height 0.3s ease, opacity 0.2s ease;
      overflow: hidden;
    }
    .settings-section.collapsed .settings-section-content {
      max-height: 0 !important;
      opacity: 0;
    }
    .settings-subsection {
      margin-top: 0.75rem;
      padding-left: 0.5rem;
      border-left: 2px solid #3d3d5c;
    }
    .settings-subsection h4 {
      font-size: 0.65rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .setting-row {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      margin-bottom: 0.75rem;
    }
    .setting-row:last-child {
      margin-bottom: 0;
    }
    .setting-row label {
      font-size: 0.8rem;
      color: #b0b0c0;
    }
    .setting-row select,
    .setting-row input[type="text"],
    .setting-row input[type="color"] {
      width: 100%;
      padding: 0.5rem;
      border-radius: 6px;
      border: 1px solid #3d3d5c;
      background: #1a1a2e;
      color: white;
      font-size: 0.85rem;
    }
    .setting-row select:focus,
    .setting-row input:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    .setting-row input[type="color"] {
      height: 36px;
      padding: 2px;
      cursor: pointer;
    }
    .setting-row input[type="checkbox"] {
      width: auto;
      margin-right: 0.5rem;
    }
    .checkbox-row {
      flex-direction: row;
      align-items: center;
    }
    .checkbox-row label {
      cursor: pointer;
    }
    
    /* Color inputs with preview */
    .color-input-wrapper {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }
    .color-input-wrapper input[type="color"] {
      width: 50px;
      flex-shrink: 0;
    }
    .color-input-wrapper input[type="text"] {
      flex: 1;
      font-family: monospace;
    }
    
    /* Preview Area */
    .preview-area {
      flex: 1;
      height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--bg-gradient-start) 0%, var(--bg-gradient-end) 100%);
      padding: 2rem;
      position: relative;
      transition: background 0.3s ease;
      overflow: hidden;
    }
    authhero-widget {
      max-width: 400px;
      width: 100%;
    }
    
    /* Status Bar */
    .status-bar {
      position: absolute;
      top: 1rem;
      right: 1rem;
      display: flex;
      gap: 0.5rem;
    }
    .status-badge {
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(10px);
      padding: 0.4rem 0.75rem;
      border-radius: 20px;
      font-size: 0.7rem;
      color: white;
    }
    .status-badge strong {
      color: #fbbf24;
    }
    
    /* Event Log */
    .event-log {
      position: absolute;
      bottom: 1rem;
      right: 1rem;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(10px);
      padding: 0.75rem;
      border-radius: 8px;
      color: #d4d4d4;
      font-family: monospace;
      font-size: 0.65rem;
      max-width: 280px;
      max-height: 180px;
      overflow-y: auto;
    }
    .event-log h4 {
      color: #9ca3af;
      margin-bottom: 0.5rem;
      font-size: 0.7rem;
    }
    .event-entry {
      padding: 0.2rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      word-break: break-all;
    }
    
    /* Buttons */
    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--primary-color);
      color: white;
    }
    .btn-primary:hover {
      filter: brightness(1.1);
    }
    .btn-secondary {
      background: #3d3d5c;
      color: white;
    }
    .btn-secondary:hover {
      background: #4d4d6c;
    }
    .btn-group {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    
    /* Device Preview Frame */
    .device-frame {
      background: #1a1a2e;
      border-radius: 24px;
      padding: 12px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      transition: all 0.3s ease;
    }
    .device-frame .device-screen {
      border-radius: 16px;
      overflow: hidden;
      background: white;
      display: flex;
      flex-direction: column;
    }
    .device-frame.mobile {
      width: 375px;
      height: 667px;
    }
    .device-frame.mobile .device-screen {
      width: 100%;
      height: 100%;
      justify-content: center;
    }
    .device-frame.mobile authhero-widget {
      max-width: none;
    }
    .preview-area.mobile-preview {
      padding: 2rem;
      background: #1a1a2e;
    }
    .preview-area:not(.mobile-preview) .device-frame {
      background: transparent;
      padding: 0;
      box-shadow: none;
      border-radius: 0;
    }
    .preview-area:not(.mobile-preview) .device-frame .device-screen {
      border-radius: 0;
      background: transparent;
    }
    
    /* Viewport toggle buttons */
    .viewport-toggle {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.5rem;
    }
    .viewport-btn {
      flex: 1;
      padding: 0.5rem;
      border: 1px solid #3d3d5c;
      background: #1a1a2e;
      color: #b0b0c0;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      transition: all 0.2s;
    }
    .viewport-btn:hover {
      background: #252540;
    }
    .viewport-btn.active {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: white;
    }
    .viewport-btn svg {
      width: 16px;
      height: 16px;
    }

    /* Responsive */
    @media (max-width: 900px) {
      body {
        flex-direction: column;
      }
      .settings-panel {
        width: 100%;
        min-width: auto;
        max-height: 40vh;
        border-right: none;
        border-bottom: 1px solid #2d2d44;
      }
      .preview-area {
        min-height: 60vh;
      }
    }

    /* Small screens - hide settings panel completely */
    @media (max-width: 480px) {
      .settings-panel {
        display: none;
      }
      .preview-area {
        height: 100vh;
        min-height: 100vh;
        padding: 0;
      }
      .status-bar,
      .event-log {
        display: none;
      }
      authhero-widget {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <!-- Settings Panel -->
  <div class="settings-panel">
    <h1>Widget Demo</h1>
    
    <!-- Navigation Section -->
    <div class="settings-section" data-section="navigation">
      <h3>Navigation</h3>
      <div class="settings-section-content">
        <div class="setting-row">
          <label for="screen-select">Current Screen</label>
          <select id="screen-select">
            <option value="identifier">Identifier (Email Input)</option>
            <option value="identifier-social">Identifier (3 Social Buttons)</option>
            <option value="enter-password">Enter Password</option>
            <option value="enter-code">Enter Code (OTP)</option>
            <option value="signup">Sign Up</option>
            <option value="forgot-password">Forgot Password</option>
            <option value="success">Success</option>
          </select>
        </div>
        <div class="setting-row">
          <label for="url-mode">URL Mode</label>
          <select id="url-mode">
            <option value="path">Path-based (/u2/enter-code)</option>
            <option value="query">Query-based (?screen=enter-code)</option>
            <option value="ssr">Server-Side Rendered (Full Page)</option>
          </select>
        </div>
        <div class="setting-row">
          <label for="render-mode">Render Mode</label>
          <select id="render-mode">
            <option value="client"${renderMode === "client" ? " selected" : ""}>Client-side (Widget renders on load)</option>
            <option value="ssr"${renderMode === "ssr" ? " selected" : ""}>SSR + Hydration (Pre-rendered HTML)</option>
          </select>
        </div>
        <div class="setting-row">
          <label>Preview Viewport</label>
          <div class="viewport-toggle">
            <button type="button" class="viewport-btn active" data-viewport="desktop">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Desktop
            </button>
            <button type="button" class="viewport-btn" data-viewport="mobile">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18"/></svg>
              Mobile
            </button>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Login Settings -->
    <div class="settings-section" data-section="login">
      <h3>Login Settings</h3>
      <div class="settings-section-content">
        <div class="setting-row">
          <label for="login-strategy">Login Strategy</label>
          <select id="login-strategy">
            <option value="code">Passwordless (Code)</option>
            <option value="password">Password</option>
          </select>
        </div>
        <div class="setting-row checkbox-row">
          <input type="checkbox" id="show-social" checked>
          <label for="show-social">Show Social Login Buttons</label>
        </div>
        <div class="setting-row checkbox-row">
          <input type="checkbox" id="allow-signup" checked>
          <label for="allow-signup">Allow Sign Up</label>
        </div>
      </div>
    </div>
    
    <!-- Colors Section -->
    <div class="settings-section collapsed" data-section="colors">
      <h3>Colors</h3>
      <div class="settings-section-content">
        <div class="settings-subsection">
          <h4>Primary</h4>
          <div class="setting-row">
            <label for="primary-button">Primary Button</label>
            <div class="color-input-wrapper">
              <input type="color" id="primary-button" value="${defaultSettings.brandColor}">
              <input type="text" id="primary-button-text" value="${defaultSettings.brandColor}">
            </div>
          </div>
          <div class="setting-row">
            <label for="primary-button-label">Primary Button Label</label>
            <div class="color-input-wrapper">
              <input type="color" id="primary-button-label" value="#ffffff">
              <input type="text" id="primary-button-label-text" value="#ffffff">
            </div>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Secondary</h4>
          <div class="setting-row">
            <label for="secondary-button-border">Secondary Button Border</label>
            <div class="color-input-wrapper">
              <input type="color" id="secondary-button-border" value="#d1d5db">
              <input type="text" id="secondary-button-border-text" value="#d1d5db">
            </div>
          </div>
          <div class="setting-row">
            <label for="secondary-button-label">Secondary Button Label</label>
            <div class="color-input-wrapper">
              <input type="color" id="secondary-button-label" value="#374151">
              <input type="text" id="secondary-button-label-text" value="#374151">
            </div>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Text</h4>
          <div class="setting-row">
            <label for="header-color">Header</label>
            <div class="color-input-wrapper">
              <input type="color" id="header-color" value="#111827">
              <input type="text" id="header-color-text" value="#111827">
            </div>
          </div>
          <div class="setting-row">
            <label for="body-text">Body Text</label>
            <div class="color-input-wrapper">
              <input type="color" id="body-text" value="#374151">
              <input type="text" id="body-text-text" value="#374151">
            </div>
          </div>
          <div class="setting-row">
            <label for="links-color">Links & Focused</label>
            <div class="color-input-wrapper">
              <input type="color" id="links-color" value="${defaultSettings.brandColor}">
              <input type="text" id="links-color-text" value="${defaultSettings.brandColor}">
            </div>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Widget</h4>
          <div class="setting-row">
            <label for="widget-bg">Widget Background</label>
            <div class="color-input-wrapper">
              <input type="color" id="widget-bg" value="#ffffff">
              <input type="text" id="widget-bg-text" value="#ffffff">
            </div>
          </div>
          <div class="setting-row">
            <label for="widget-border">Widget Border</label>
            <div class="color-input-wrapper">
              <input type="color" id="widget-border" value="#e5e7eb">
              <input type="text" id="widget-border-text" value="#e5e7eb">
            </div>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Inputs</h4>
          <div class="setting-row">
            <label for="input-bg">Input Background</label>
            <div class="color-input-wrapper">
              <input type="color" id="input-bg" value="#ffffff">
              <input type="text" id="input-bg-text" value="#ffffff">
            </div>
          </div>
          <div class="setting-row">
            <label for="input-border">Input Border</label>
            <div class="color-input-wrapper">
              <input type="color" id="input-border" value="#d1d5db">
              <input type="text" id="input-border-text" value="#d1d5db">
            </div>
          </div>
          <div class="setting-row">
            <label for="input-filled-text">Input Filled Text</label>
            <div class="color-input-wrapper">
              <input type="color" id="input-filled-text" value="#111827">
              <input type="text" id="input-filled-text-text" value="#111827">
            </div>
          </div>
          <div class="setting-row">
            <label for="input-labels">Input Labels/Placeholders</label>
            <div class="color-input-wrapper">
              <input type="color" id="input-labels" value="#6b7280">
              <input type="text" id="input-labels-text" value="#6b7280">
            </div>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>States</h4>
          <div class="setting-row">
            <label for="focus-color">Focus Color</label>
            <div class="color-input-wrapper">
              <input type="color" id="focus-color" value="${defaultSettings.brandColor}">
              <input type="text" id="focus-color-text" value="${defaultSettings.brandColor}">
            </div>
          </div>
          <div class="setting-row">
            <label for="hover-color">Hover Color</label>
            <div class="color-input-wrapper">
              <input type="color" id="hover-color" value="#f3f4f6">
              <input type="text" id="hover-color-text" value="#f3f4f6">
            </div>
          </div>
          <div class="setting-row">
            <label for="error-color">Error</label>
            <div class="color-input-wrapper">
              <input type="color" id="error-color" value="#dc2626">
              <input type="text" id="error-color-text" value="#dc2626">
            </div>
          </div>
          <div class="setting-row">
            <label for="success-color">Success</label>
            <div class="color-input-wrapper">
              <input type="color" id="success-color" value="#16a34a">
              <input type="text" id="success-color-text" value="#16a34a">
            </div>
          </div>
          <div class="setting-row">
            <label for="icons-color">Icons</label>
            <div class="color-input-wrapper">
              <input type="color" id="icons-color" value="#6b7280">
              <input type="text" id="icons-color-text" value="#6b7280">
            </div>
          </div>
          <div class="setting-row">
            <label for="captcha-theme">Captcha Widget Theme</label>
            <select id="captcha-theme">
              <option value="auto" selected>Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Page</h4>
          <div class="setting-row">
            <label for="page-bg">Page Background</label>
            <div class="color-input-wrapper">
              <input type="color" id="page-bg" value="${defaultSettings.brandColor}">
              <input type="text" id="page-bg-text" value="${defaultSettings.brandColor}">
            </div>
          </div>
          <div class="setting-row">
            <label for="page-bg-image">Background Image URL</label>
            <input type="text" id="page-bg-image" placeholder="https://example.com/bg.jpg">
          </div>
          <div class="setting-row">
            <label for="page-layout">Page Layout</label>
            <select id="page-layout">
              <option value="center" selected>Center</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Borders Section -->
    <div class="settings-section collapsed" data-section="borders">
      <h3>Borders</h3>
      <div class="settings-section-content">
        <div class="settings-subsection">
          <h4>Widget</h4>
          <div class="setting-row">
            <label for="widget-corner-radius">Corner Radius</label>
            <input type="number" id="widget-corner-radius" value="12" min="0" max="32">
          </div>
          <div class="setting-row">
            <label for="widget-border-weight">Border Weight</label>
            <input type="number" id="widget-border-weight" value="1" min="0" max="4">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="show-widget-shadow" checked>
            <label for="show-widget-shadow">Show Widget Shadow</label>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Buttons</h4>
          <div class="setting-row">
            <label for="buttons-style">Button Style</label>
            <select id="buttons-style">
              <option value="rounded" selected>Rounded</option>
              <option value="pill">Pill</option>
              <option value="sharp">Sharp</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="button-border-radius">Border Radius</label>
            <input type="number" id="button-border-radius" value="8" min="0" max="32">
          </div>
          <div class="setting-row">
            <label for="button-border-weight">Border Weight</label>
            <input type="number" id="button-border-weight" value="1" min="0" max="4">
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Inputs</h4>
          <div class="setting-row">
            <label for="inputs-style">Input Style</label>
            <select id="inputs-style">
              <option value="rounded" selected>Rounded</option>
              <option value="pill">Pill</option>
              <option value="sharp">Sharp</option>
            </select>
          </div>
          <div class="setting-row">
            <label for="input-border-radius">Border Radius</label>
            <input type="number" id="input-border-radius" value="8" min="0" max="32">
          </div>
          <div class="setting-row">
            <label for="input-border-weight">Border Weight</label>
            <input type="number" id="input-border-weight" value="1" min="0" max="4">
          </div>
        </div>
      </div>
    </div>
    
    <!-- Typography Section -->
    <div class="settings-section collapsed" data-section="typography">
      <h3>Typography</h3>
      <div class="settings-section-content">
        <div class="setting-row">
          <label for="font-url">Font URL (Google Fonts)</label>
          <input type="text" id="font-url" placeholder="https://fonts.googleapis.com/css2?family=Inter">
        </div>
        <div class="setting-row">
          <label for="reference-text-size">Reference Text Size</label>
          <input type="number" id="reference-text-size" value="16" min="12" max="24">
        </div>
        
        <div class="settings-subsection">
          <h4>Title</h4>
          <div class="setting-row">
            <label for="title-size">Size (%)</label>
            <input type="number" id="title-size" value="150" min="100" max="200">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="title-bold" checked>
            <label for="title-bold">Bold</label>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Subtitle</h4>
          <div class="setting-row">
            <label for="subtitle-size">Size (%)</label>
            <input type="number" id="subtitle-size" value="87.5" min="50" max="150">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="subtitle-bold">
            <label for="subtitle-bold">Bold</label>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Body Text</h4>
          <div class="setting-row">
            <label for="body-size">Size (%)</label>
            <input type="number" id="body-size" value="87.5" min="50" max="150">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="body-bold">
            <label for="body-bold">Bold</label>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Buttons</h4>
          <div class="setting-row">
            <label for="buttons-size">Size (%)</label>
            <input type="number" id="buttons-size" value="100" min="50" max="150">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="buttons-bold">
            <label for="buttons-bold">Bold</label>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Input Labels</h4>
          <div class="setting-row">
            <label for="labels-size">Size (%)</label>
            <input type="number" id="labels-size" value="100" min="50" max="150">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="labels-bold">
            <label for="labels-bold">Bold</label>
          </div>
        </div>
        
        <div class="settings-subsection">
          <h4>Links</h4>
          <div class="setting-row">
            <label for="links-size">Size (%)</label>
            <input type="number" id="links-size" value="87.5" min="50" max="150">
          </div>
          <div class="setting-row checkbox-row">
            <input type="checkbox" id="links-bold">
            <label for="links-bold">Bold</label>
          </div>
          <div class="setting-row">
            <label for="links-style">Style</label>
            <select id="links-style">
              <option value="normal" selected>Normal</option>
              <option value="underlined">Underlined</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Widget Section -->
    <div class="settings-section collapsed" data-section="widget">
      <h3>Widget</h3>
      <div class="settings-section-content">
        <div class="setting-row">
          <label for="logo-url">Logo URL</label>
          <input type="text" id="logo-url" placeholder="https://example.com/logo.png">
        </div>
        <div class="setting-row">
          <label for="logo-position">Logo Position</label>
          <select id="logo-position">
            <option value="center" selected>Center</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="none">None</option>
          </select>
        </div>
        <div class="setting-row">
          <label for="logo-height">Logo Height (px)</label>
          <input type="number" id="logo-height" value="52" min="20" max="120">
        </div>
        <div class="setting-row">
          <label for="header-alignment">Header Text Alignment</label>
          <select id="header-alignment">
            <option value="center" selected>Center</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </div>
        <div class="setting-row">
          <label for="social-layout">Social Buttons Layout</label>
          <select id="social-layout">
            <option value="bottom" selected>Bottom</option>
            <option value="top">Top</option>
          </select>
        </div>
      </div>
    </div>
    
    <!-- Actions -->
    <div class="settings-section" data-section="actions">
      <h3>Actions</h3>
      <div class="settings-section-content">
        <div class="btn-group">
          <button class="btn btn-primary" id="reset-session">Reset Session</button>
          <button class="btn btn-secondary" id="copy-config">Copy Config</button>
        </div>
        <div class="btn-group">
          <button class="btn btn-secondary" id="reset-theme">Reset Theme</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Preview Area -->
  <div class="preview-area" id="preview-area">
    <div class="status-bar">
      <div class="status-badge">Screen: <strong id="screen-id">${screenId}</strong></div>
      <div class="status-badge">Mode: <strong id="mode-display">${urlMode}</strong></div>
      <div class="status-badge">Render: <strong id="render-mode-display">${renderMode}</strong></div>
    </div>
    
    <div class="device-frame" id="device-frame">
      <div class="device-screen">
        ${prerenderedWidgetHtml ? prerenderedWidgetHtml : '<authhero-widget id="widget"></authhero-widget>'}
      </div>
    </div>
    
    <div class="event-log">
      <h4>Event Log</h4>
      <div id="events"></div>
    </div>
  </div>

  <script type="module">
    // =========================================
    // State
    // =========================================
    const widget = document.getElementById('widget');
    const eventsEl = document.getElementById('events');
    const screenIdEl = document.getElementById('screen-id');
    const modeDisplayEl = document.getElementById('mode-display');
    const previewArea = document.getElementById('preview-area');
    
    const baseUrl = '${baseUrl}';
    let currentState = '${state}';
    let currentScreen = '${screenId}';
    
    // =========================================
    // Session Storage
    // =========================================
    const STORAGE_KEY = 'authhero-demo-settings';
    
    function loadSettings() {
      try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        if (saved) {
          return JSON.parse(saved);
        }
      } catch (e) {
        console.warn('Failed to load settings from sessionStorage', e);
      }
      return null;
    }
    
    function saveSettings() {
      try {
        const settings = {
          urlMode,
          renderMode,
          loginStrategy,
          showSocial,
          allowSignup,
          branding,
          theme,
          collapsedSections: getCollapsedSections(),
        };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      } catch (e) {
        console.warn('Failed to save settings to sessionStorage', e);
      }
    }
    
    function getCollapsedSections() {
      const sections = document.querySelectorAll('.settings-section');
      const collapsed = {};
      sections.forEach(s => {
        const name = s.dataset.section;
        if (name) collapsed[name] = s.classList.contains('collapsed');
      });
      return collapsed;
    }
    
    // Load saved settings or use defaults
    const savedSettings = loadSettings();
    
    // Settings state
    let urlMode = savedSettings?.urlMode || '${urlMode}';
    let renderMode = new URLSearchParams(window.location.search).get('renderMode') || savedSettings?.renderMode || '${renderMode}';
    let loginStrategy = savedSettings?.loginStrategy || 'code';
    let showSocial = savedSettings?.showSocial ?? true;
    let allowSignup = savedSettings?.allowSignup ?? true;
    let socialProviders = '${providers || "google-oauth2"}';
    
    // Branding state - now includes full theme options
    let branding = savedSettings?.branding || getDefaultBranding();
    let theme = savedSettings?.theme || getDefaultTheme();
    
    function getDefaultBranding() {
      return {
        colors: {
          primary: '${defaultSettings.brandColor}',
          page_background: {
            type: 'solid',
            start: '${defaultSettings.brandColor}',
          },
        },
        logo_url: '',
        font: {
          url: '',
        },
      };
    }
    
    function getDefaultTheme() {
      return {
        borders: {
          widget_corner_radius: 12,
          widget_border_weight: 1,
          show_widget_shadow: true,
          buttons_style: 'rounded',
          button_border_radius: 8,
          button_border_weight: 1,
          inputs_style: 'rounded',
          input_border_radius: 8,
          input_border_weight: 1,
        },
        colors: {
          primary_button: '${defaultSettings.brandColor}',
          primary_button_label: '#ffffff',
          secondary_button_border: '#d1d5db',
          secondary_button_label: '#374151',
          header: '#111827',
          body_text: '#374151',
          links_focused_components: '${defaultSettings.brandColor}',
          widget_background: '#ffffff',
          widget_border: '#e5e7eb',
          input_background: '#ffffff',
          input_border: '#d1d5db',
          input_filled_text: '#111827',
          input_labels_placeholders: '#6b7280',
          base_focus_color: '${defaultSettings.brandColor}',
          base_hover_color: '#f3f4f6',
          error: '#dc2626',
          success: '#16a34a',
          icons: '#6b7280',
          captcha_widget_theme: 'auto',
        },
        fonts: {
          font_url: '',
          reference_text_size: 16,
          title: { size: 150, bold: true },
          subtitle: { size: 87.5, bold: false },
          body_text: { size: 87.5, bold: false },
          buttons_text: { size: 100, bold: false },
          input_labels: { size: 100, bold: false },
          links: { size: 87.5, bold: false },
          links_style: 'normal',
        },
        page_background: {
          background_color: '${defaultSettings.brandColor}',
          background_image_url: '',
          page_layout: 'center',
        },
        widget: {
          logo_url: '',
          logo_position: 'center',
          logo_height: 52,
          header_text_alignment: 'center',
          social_buttons_layout: 'bottom',
        },
      };
    }

    // =========================================
    // Logging
    // =========================================
    function log(message) {
      const entry = document.createElement('div');
      entry.className = 'event-entry';
      entry.textContent = new Date().toLocaleTimeString() + ' ' + message;
      eventsEl.insertBefore(entry, eventsEl.firstChild);
      while (eventsEl.children.length > 15) eventsEl.removeChild(eventsEl.lastChild);
    }

    // =========================================
    // URL Management
    // =========================================
    
    // Extract screen name from a URL path
    function extractScreenFromPath(pathname) {
      // Map of path patterns to screen names
      const pathToScreen = {
        '/u2/login/identifier-social': 'identifier-social',
        '/u2/login/identifier': 'identifier',
        '/u2/enter-password': 'enter-password',
        '/u2/enter-code': 'enter-code',
        '/u2/signup': 'signup',
        '/u2/forgot-password': 'forgot-password',
        '/u2/success': 'success',
      };
      
      for (const [path, screen] of Object.entries(pathToScreen)) {
        if (pathname.startsWith(path)) {
          return screen;
        }
      }
      return null;
    }
    
    function buildUrl(screenId) {
      if (urlMode === 'path' || urlMode === 'ssr') {
        const pathMap = {
          'identifier': '/u2/login/identifier',
          'identifier-social': '/u2/login/identifier-social',
          'enter-password': '/u2/enter-password',
          'enter-code': '/u2/enter-code',
          'signup': '/u2/signup',
          'forgot-password': '/u2/forgot-password',
          'success': '/u2/success',
        };
        let url = (pathMap[screenId] || pathMap['identifier']) + '?state=' + currentState;
        if (renderMode === 'ssr') {
          url += '&renderMode=ssr';
        }
        return url;
      } else {
        return '/u2/login?screen=' + screenId + '&state=' + currentState;
      }
    }

    // =========================================
    // Screen Fetching
    // =========================================
    async function fetchScreen(screenId, updateUrl = true) {
      try {
        // Build query params for settings
        const params = new URLSearchParams({
          state: currentState,
          strategy: loginStrategy,
          showSocial: showSocial,
          allowSignup: allowSignup,
          providers: socialProviders,
        });
        
        const response = await fetch(baseUrl + '/u2/screen/' + screenId + '?' + params, {
          credentials: 'include',
          headers: { 'Accept': 'application/json' },
        });
        
        if (!response.ok) throw new Error('Failed to load screen');
        
        const data = await response.json();
        
        if (data.screen) {
          widget.screen = data.screen;
          currentScreen = screenId;
          screenIdEl.textContent = screenId;
          document.getElementById('screen-select').value = screenId;
          
          // Apply branding
          applyBranding();
        }
        
        if (updateUrl && urlMode !== 'ssr') {
          const newUrl = buildUrl(screenId);
          window.history.pushState({ screen: screenId, state: currentState }, '', newUrl);
        }
      } catch (error) {
        console.error('Error fetching screen:', error);
        log('Error: ' + error.message);
      }
    }

    // =========================================
    // Navigation
    // =========================================
    function navigateTo(screenId) {
      if (urlMode === 'ssr') {
        // Full page navigation for SSR mode
        window.location.href = buildUrl(screenId);
        return;
      }
      fetchScreen(screenId);
      log('Navigate → ' + screenId);
    }

    // =========================================
    // Branding
    // =========================================
    function applyBranding(refetchScreen = false) {
      // Pass both branding and theme to widget
      // Use JSON parse/stringify for deep clone to trigger Stencil's change detection
      widget.branding = JSON.parse(JSON.stringify(branding));
      widget.theme = JSON.parse(JSON.stringify(theme));
      
      // Update page background
      const bgColor = theme.page_background?.background_color || branding.colors?.page_background?.start || '${defaultSettings.brandColor}';
      const bgImage = theme.page_background?.background_image_url;
      if (bgImage) {
        previewArea.style.background = 'url(' + bgImage + ') center/cover no-repeat';
      } else {
        previewArea.style.background = 'linear-gradient(135deg, ' + bgColor + ' 0%, #764ba2 100%)';
      }
      
      // Update page layout
      const layout = theme.page_background?.page_layout || 'center';
      previewArea.style.justifyContent = layout === 'left' ? 'flex-start' : layout === 'right' ? 'flex-end' : 'center';
      
      // Update CSS variables
      document.documentElement.style.setProperty('--primary-color', branding.colors?.primary || theme.colors?.primary_button || '${defaultSettings.brandColor}');
      
      // Persist to session storage
      saveSettings();
      
      // Optionally refetch the screen to apply server-side theme changes
      if (refetchScreen) {
        fetchScreen(currentScreen, false);
      }
    }
    
    function updateThemeFromInputs() {
      // Colors
      theme.colors.primary_button = document.getElementById('primary-button').value;
      theme.colors.primary_button_label = document.getElementById('primary-button-label').value;
      theme.colors.secondary_button_border = document.getElementById('secondary-button-border').value;
      theme.colors.secondary_button_label = document.getElementById('secondary-button-label').value;
      theme.colors.header = document.getElementById('header-color').value;
      theme.colors.body_text = document.getElementById('body-text').value;
      theme.colors.links_focused_components = document.getElementById('links-color').value;
      theme.colors.widget_background = document.getElementById('widget-bg').value;
      theme.colors.widget_border = document.getElementById('widget-border').value;
      theme.colors.input_background = document.getElementById('input-bg').value;
      theme.colors.input_border = document.getElementById('input-border').value;
      theme.colors.input_filled_text = document.getElementById('input-filled-text').value;
      theme.colors.input_labels_placeholders = document.getElementById('input-labels').value;
      theme.colors.base_focus_color = document.getElementById('focus-color').value;
      theme.colors.base_hover_color = document.getElementById('hover-color').value;
      theme.colors.error = document.getElementById('error-color').value;
      theme.colors.success = document.getElementById('success-color').value;
      theme.colors.icons = document.getElementById('icons-color').value;
      theme.colors.captcha_widget_theme = document.getElementById('captcha-theme').value;
      
      // Page background
      theme.page_background.background_color = document.getElementById('page-bg').value;
      theme.page_background.background_image_url = document.getElementById('page-bg-image').value;
      theme.page_background.page_layout = document.getElementById('page-layout').value;
      
      // Borders
      theme.borders.widget_corner_radius = parseInt(document.getElementById('widget-corner-radius').value) || 12;
      theme.borders.widget_border_weight = parseInt(document.getElementById('widget-border-weight').value) || 1;
      theme.borders.show_widget_shadow = document.getElementById('show-widget-shadow').checked;
      theme.borders.buttons_style = document.getElementById('buttons-style').value;
      theme.borders.button_border_radius = parseInt(document.getElementById('button-border-radius').value) || 8;
      theme.borders.button_border_weight = parseInt(document.getElementById('button-border-weight').value) || 1;
      theme.borders.inputs_style = document.getElementById('inputs-style').value;
      theme.borders.input_border_radius = parseInt(document.getElementById('input-border-radius').value) || 8;
      theme.borders.input_border_weight = parseInt(document.getElementById('input-border-weight').value) || 1;
      
      // Typography
      theme.fonts.font_url = document.getElementById('font-url').value;
      theme.fonts.reference_text_size = parseInt(document.getElementById('reference-text-size').value) || 16;
      theme.fonts.title = { size: parseFloat(document.getElementById('title-size').value) || 150, bold: document.getElementById('title-bold').checked };
      theme.fonts.subtitle = { size: parseFloat(document.getElementById('subtitle-size').value) || 87.5, bold: document.getElementById('subtitle-bold').checked };
      theme.fonts.body_text = { size: parseFloat(document.getElementById('body-size').value) || 87.5, bold: document.getElementById('body-bold').checked };
      theme.fonts.buttons_text = { size: parseFloat(document.getElementById('buttons-size').value) || 100, bold: document.getElementById('buttons-bold').checked };
      theme.fonts.input_labels = { size: parseFloat(document.getElementById('labels-size').value) || 100, bold: document.getElementById('labels-bold').checked };
      theme.fonts.links = { size: parseFloat(document.getElementById('links-size').value) || 87.5, bold: document.getElementById('links-bold').checked };
      theme.fonts.links_style = document.getElementById('links-style').value;
      
      // Widget
      theme.widget.logo_url = document.getElementById('logo-url').value;
      theme.widget.logo_position = document.getElementById('logo-position').value;
      theme.widget.logo_height = parseInt(document.getElementById('logo-height').value) || 52;
      theme.widget.header_text_alignment = document.getElementById('header-alignment').value;
      theme.widget.social_buttons_layout = document.getElementById('social-layout').value;
      
      // Also update branding for backwards compatibility
      branding.colors.primary = theme.colors.primary_button;
      branding.colors.page_background = { type: 'solid', start: theme.page_background.background_color };
      branding.logo_url = theme.widget.logo_url;
      branding.font.url = theme.fonts.font_url;
      
      applyBranding();
    }
    
    // Sync UI controls with loaded settings
    function syncUIWithSettings() {
      // URL mode
      document.getElementById('url-mode').value = urlMode;
      modeDisplayEl.textContent = urlMode;
      
      // Login settings
      document.getElementById('login-strategy').value = loginStrategy;
      document.getElementById('show-social').checked = showSocial;
      document.getElementById('allow-signup').checked = allowSignup;
      
      // Colors
      syncColorInput('primary-button', theme.colors?.primary_button || '${defaultSettings.brandColor}');
      syncColorInput('primary-button-label', theme.colors?.primary_button_label || '#ffffff');
      syncColorInput('secondary-button-border', theme.colors?.secondary_button_border || '#d1d5db');
      syncColorInput('secondary-button-label', theme.colors?.secondary_button_label || '#374151');
      syncColorInput('header-color', theme.colors?.header || '#111827');
      syncColorInput('body-text', theme.colors?.body_text || '#374151');
      syncColorInput('links-color', theme.colors?.links_focused_components || '${defaultSettings.brandColor}');
      syncColorInput('widget-bg', theme.colors?.widget_background || '#ffffff');
      syncColorInput('widget-border', theme.colors?.widget_border || '#e5e7eb');
      syncColorInput('input-bg', theme.colors?.input_background || '#ffffff');
      syncColorInput('input-border', theme.colors?.input_border || '#d1d5db');
      syncColorInput('input-filled-text', theme.colors?.input_filled_text || '#111827');
      syncColorInput('input-labels', theme.colors?.input_labels_placeholders || '#6b7280');
      syncColorInput('focus-color', theme.colors?.base_focus_color || '${defaultSettings.brandColor}');
      syncColorInput('hover-color', theme.colors?.base_hover_color || '#f3f4f6');
      syncColorInput('error-color', theme.colors?.error || '#dc2626');
      syncColorInput('success-color', theme.colors?.success || '#16a34a');
      syncColorInput('icons-color', theme.colors?.icons || '#6b7280');
      document.getElementById('captcha-theme').value = theme.colors?.captcha_widget_theme || 'auto';
      syncColorInput('page-bg', theme.page_background?.background_color || '${defaultSettings.brandColor}');
      
      // Page background
      document.getElementById('page-bg-image').value = theme.page_background?.background_image_url || '';
      document.getElementById('page-layout').value = theme.page_background?.page_layout || 'center';
      
      // Borders
      document.getElementById('widget-corner-radius').value = theme.borders?.widget_corner_radius ?? 12;
      document.getElementById('widget-border-weight').value = theme.borders?.widget_border_weight ?? 1;
      document.getElementById('show-widget-shadow').checked = theme.borders?.show_widget_shadow ?? true;
      document.getElementById('buttons-style').value = theme.borders?.buttons_style || 'rounded';
      document.getElementById('button-border-radius').value = theme.borders?.button_border_radius ?? 8;
      document.getElementById('button-border-weight').value = theme.borders?.button_border_weight ?? 1;
      document.getElementById('inputs-style').value = theme.borders?.inputs_style || 'rounded';
      document.getElementById('input-border-radius').value = theme.borders?.input_border_radius ?? 8;
      document.getElementById('input-border-weight').value = theme.borders?.input_border_weight ?? 1;
      
      // Typography
      document.getElementById('font-url').value = theme.fonts?.font_url || '';
      document.getElementById('reference-text-size').value = theme.fonts?.reference_text_size ?? 16;
      document.getElementById('title-size').value = theme.fonts?.title?.size ?? 150;
      document.getElementById('title-bold').checked = theme.fonts?.title?.bold ?? true;
      document.getElementById('subtitle-size').value = theme.fonts?.subtitle?.size ?? 87.5;
      document.getElementById('subtitle-bold').checked = theme.fonts?.subtitle?.bold ?? false;
      document.getElementById('body-size').value = theme.fonts?.body_text?.size ?? 87.5;
      document.getElementById('body-bold').checked = theme.fonts?.body_text?.bold ?? false;
      document.getElementById('buttons-size').value = theme.fonts?.buttons_text?.size ?? 100;
      document.getElementById('buttons-bold').checked = theme.fonts?.buttons_text?.bold ?? false;
      document.getElementById('labels-size').value = theme.fonts?.input_labels?.size ?? 100;
      document.getElementById('labels-bold').checked = theme.fonts?.input_labels?.bold ?? false;
      document.getElementById('links-size').value = theme.fonts?.links?.size ?? 87.5;
      document.getElementById('links-bold').checked = theme.fonts?.links?.bold ?? false;
      document.getElementById('links-style').value = theme.fonts?.links_style || 'normal';
      
      // Widget
      document.getElementById('logo-url').value = theme.widget?.logo_url || '';
      document.getElementById('logo-position').value = theme.widget?.logo_position || 'center';
      document.getElementById('logo-height').value = theme.widget?.logo_height ?? 52;
      document.getElementById('header-alignment').value = theme.widget?.header_text_alignment || 'center';
      document.getElementById('social-layout').value = theme.widget?.social_buttons_layout || 'bottom';
      
      // Restore collapsed sections
      const collapsed = savedSettings?.collapsedSections || {};
      document.querySelectorAll('.settings-section').forEach(section => {
        const name = section.dataset.section;
        if (name && collapsed[name] !== undefined) {
          section.classList.toggle('collapsed', collapsed[name]);
        }
      });
    }
    
    function syncColorInput(id, value) {
      const colorInput = document.getElementById(id);
      const textInput = document.getElementById(id + '-text');
      if (colorInput) colorInput.value = value;
      if (textInput) textInput.value = value;
    }

    // =========================================
    // Event Handlers
    // =========================================
    
    // Form submission
    widget.addEventListener('formSubmit', async (event) => {
      const { screen, data } = event.detail;
      log('Submit: ' + Object.keys(data).join(', '));
      
      widget.loading = true;
      
      try {
        const params = new URLSearchParams({
          state: currentState,
          strategy: loginStrategy,
        });
        
        const response = await fetch(screen.action.split('?')[0] + '?' + params, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ data }),
        });
        
        const result = await response.json();
        
        if (result.redirect) {
          const redirectUrl = new URL(result.redirect, window.location.origin);
          
          if (redirectUrl.pathname === '/callback') {
            navigateTo('success');
          } else {
            let nextScreen = extractScreenFromPath(redirectUrl.pathname);
            if (!nextScreen) {
              nextScreen = redirectUrl.searchParams.get('screen') || 'identifier';
            }
            navigateTo(nextScreen);
          }
          return;
        }
        
        if (result.screen) {
          widget.screen = result.screen;
          applyBranding();
        }
      } catch (error) {
        console.error('Submit error:', error);
        log('Error: ' + error.message);
      } finally {
        widget.loading = false;
      }
    });

    // Social button clicks
    widget.addEventListener('buttonClick', (event) => {
      const { type, value } = event.detail;
      log('Button: ' + type + (value ? ' (' + value + ')' : ''));
      
      if (type === 'SOCIAL' && value) {
        log('→ OAuth redirect: ' + value);
      }
    });

    // Link clicks
    widget.addEventListener('linkClick', (event) => {
      event.preventDefault();
      const { href } = event.detail;
      log('Link: ' + href);
      
      const url = new URL(href, window.location.origin);
      let nextScreen = extractScreenFromPath(url.pathname);
      
      if (!nextScreen) {
        nextScreen = url.searchParams.get('screen') || 'identifier';
      }
      
      if (nextScreen) {
        navigateTo(nextScreen);
      }
    });

    // Browser back/forward
    window.addEventListener('popstate', (event) => {
      if (event.state?.screen) {
        fetchScreen(event.state.screen, false);
        log('History: ' + event.state.screen);
      }
    });

    // =========================================
    // Settings Panel Event Listeners
    // =========================================
    
    // Viewport toggle
    const viewportBtns = document.querySelectorAll('.viewport-btn');
    const deviceFrame = document.getElementById('device-frame');
    
    viewportBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const viewport = btn.dataset.viewport;
        viewportBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (viewport === 'mobile') {
          previewArea.classList.add('mobile-preview');
          deviceFrame.classList.add('mobile');
        } else {
          previewArea.classList.remove('mobile-preview');
          deviceFrame.classList.remove('mobile');
        }
        log('Viewport → ' + viewport);
      });
    });
    
    // Screen selector
    document.getElementById('screen-select').addEventListener('change', (e) => {
      navigateTo(e.target.value);
    });
    
    // URL mode selector
    document.getElementById('url-mode').addEventListener('change', (e) => {
      urlMode = e.target.value;
      modeDisplayEl.textContent = urlMode;
      log('Mode → ' + urlMode);
      saveSettings();
      
      // Update URL to reflect new mode
      const newUrl = buildUrl(currentScreen);
      window.history.replaceState({ screen: currentScreen, state: currentState }, '', newUrl);
    });
    
    // Render mode selector - requires page reload to take effect
    document.getElementById('render-mode').addEventListener('change', (e) => {
      const renderMode = e.target.value;
      document.getElementById('render-mode-display').textContent = renderMode;
      log('Render mode → ' + renderMode + ' (reloading page...)');
      saveSettings();
      
      // Reload with new render mode
      const url = new URL(window.location.href);
      url.searchParams.set('renderMode', renderMode);
      window.location.href = url.toString();
    });
    
    // Login strategy
    document.getElementById('login-strategy').addEventListener('change', (e) => {
      loginStrategy = e.target.value;
      log('Strategy → ' + loginStrategy);
      saveSettings();
      // Refresh current screen with new strategy
      fetchScreen(currentScreen, false);
    });
    
    // Social login toggle
    document.getElementById('show-social').addEventListener('change', (e) => {
      showSocial = e.target.checked;
      log('Social → ' + (showSocial ? 'on' : 'off'));
      saveSettings();
      fetchScreen(currentScreen, false);
    });
    
    // Signup toggle
    document.getElementById('allow-signup').addEventListener('change', (e) => {
      allowSignup = e.target.checked;
      log('Signup → ' + (allowSignup ? 'on' : 'off'));
      saveSettings();
      fetchScreen(currentScreen, false);
    });
    
    // =========================================
    // Collapsible Sections
    // =========================================
    document.querySelectorAll('.settings-section h3').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.parentElement;
        section.classList.toggle('collapsed');
        saveSettings();
      });
    });
    
    // =========================================
    // Theme Input Handlers
    // =========================================
    
    // Color inputs - sync color picker with text input
    const colorInputIds = [
      'primary-button', 'primary-button-label',
      'secondary-button-border', 'secondary-button-label',
      'header-color', 'body-text', 'links-color',
      'widget-bg', 'widget-border',
      'input-bg', 'input-border', 'input-filled-text', 'input-labels',
      'focus-color', 'hover-color', 'error-color', 'success-color', 'icons-color',
      'page-bg'
    ];
    
    colorInputIds.forEach(id => {
      const colorInput = document.getElementById(id);
      const textInput = document.getElementById(id + '-text');
      
      if (colorInput && textInput) {
        colorInput.addEventListener('input', (e) => {
          textInput.value = e.target.value;
          updateThemeFromInputs();
        });
        
        textInput.addEventListener('input', (e) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
            colorInput.value = e.target.value;
            updateThemeFromInputs();
          }
        });
      }
    });
    
    // Select inputs
    const selectInputIds = [
      'page-layout', 'buttons-style', 'inputs-style', 'links-style',
      'logo-position', 'header-alignment', 'social-layout', 'captcha-theme'
    ];
    
    selectInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateThemeFromInputs);
    });
    
    // Number inputs
    const numberInputIds = [
      'widget-corner-radius', 'widget-border-weight',
      'button-border-radius', 'button-border-weight',
      'input-border-radius', 'input-border-weight',
      'reference-text-size', 'title-size', 'subtitle-size', 'body-size',
      'buttons-size', 'labels-size', 'links-size', 'logo-height'
    ];
    
    numberInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateThemeFromInputs);
    });
    
    // Checkbox inputs
    const checkboxInputIds = [
      'show-widget-shadow',
      'title-bold', 'subtitle-bold', 'body-bold', 'buttons-bold', 'labels-bold', 'links-bold'
    ];
    
    checkboxInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updateThemeFromInputs);
    });
    
    // Text inputs
    const textInputIds = ['font-url', 'logo-url', 'page-bg-image'];
    
    textInputIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateThemeFromInputs);
    });
    
    // Reset session
    document.getElementById('reset-session').addEventListener('click', () => {
      currentState = 'demo_' + Math.random().toString(36).substr(2, 9);
      navigateTo('identifier');
      log('Session reset');
    });
    
    // Copy config
    document.getElementById('copy-config').addEventListener('click', () => {
      const config = {
        branding,
        theme,
        settings: { loginStrategy, showSocial, allowSignup },
        urlMode,
      };
      navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      log('Config copied!');
    });
    
    // Reset theme
    document.getElementById('reset-theme').addEventListener('click', () => {
      branding = getDefaultBranding();
      theme = getDefaultTheme();
      syncUIWithSettings();
      applyBranding();
      log('Theme reset to defaults');
    });

    // =========================================
    // Initialize
    // =========================================
    syncUIWithSettings();
    applyBranding();
    fetchScreen('${screenId}', false);
    log('Initialized' + (savedSettings ? ' (settings restored)' : ''));
  </script>
</body>
</html>`;
}

// ============================================
// Hono App
// ============================================

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Serve widget files from dist
app.get("/widget/*", async (c) => {
  const path = c.req.path.replace("/widget", "dist");
  try {
    const file = await import("fs/promises").then((fs) =>
      fs.readFile(path, "utf-8"),
    );

    // Determine content type based on file extension
    let contentType = "text/plain";
    if (path.endsWith(".js")) contentType = "application/javascript";
    else if (path.endsWith(".css")) contentType = "text/css";
    else if (path.endsWith(".json")) contentType = "application/json";
    else if (path.endsWith(".svg")) contentType = "image/svg+xml";
    else if (path.endsWith(".html")) contentType = "text/html";
    else if (path.endsWith(".png")) contentType = "image/png";
    else if (path.endsWith(".jpg") || path.endsWith(".jpeg"))
      contentType = "image/jpeg";
    else if (path.endsWith(".woff")) contentType = "font/woff";
    else if (path.endsWith(".woff2")) contentType = "font/woff2";

    return c.body(file, 200, { "Content-Type": contentType });
  } catch {
    return c.text("Not found", 404);
  }
});

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// ----------------------------------------
// Screen API: GET /u2/screen/:screenId
// ----------------------------------------
app.get("/u2/screen/:screenId", (c) => {
  const screenId = c.req.param("screenId");
  const state =
    c.req.query("state") || "demo_" + Math.random().toString(36).substr(2, 9);
  const baseUrl = new URL(c.req.url).origin;

  // Parse dynamic settings from query params
  const settings = parseSettings({
    strategy: c.req.query("strategy"),
    showSocial: c.req.query("showSocial"),
    allowSignup: c.req.query("allowSignup"),
  });

  const result = getScreen(screenId, state, baseUrl, settings);

  if (!result) {
    return c.json({ error: "Screen not found" }, 404);
  }

  return c.json(result);
});

// ----------------------------------------
// Screen API: POST /u2/screen/:screenId
// ----------------------------------------
app.post("/u2/screen/:screenId", async (c) => {
  const screenId = c.req.param("screenId");
  const state = c.req.query("state") || "demo";
  const baseUrl = new URL(c.req.url).origin;

  // Parse dynamic settings from query params
  const settings = parseSettings({
    strategy: c.req.query("strategy"),
    showSocial: c.req.query("showSocial"),
    allowSignup: c.req.query("allowSignup"),
  });

  let data: Record<string, unknown> = {};
  try {
    const body = await c.req.json();
    data = body.data || {};
  } catch {
    // Empty body is OK
  }

  let result: PostResponse;

  switch (screenId) {
    case "identifier":
    case "identifier-social":
      result = handleIdentifierPost(data, state, baseUrl, settings);
      break;
    case "enter-password":
      result = handleEnterPasswordPost(data, state, baseUrl);
      break;
    case "enter-code":
      result = handleEnterCodePost(data, state, baseUrl);
      break;
    case "signup":
      result = handleSignupPost(data, state, baseUrl, settings);
      break;
    case "forgot-password":
      result = handleForgotPasswordPost(data, state, baseUrl);
      break;
    default:
      return c.json({ error: "Unknown screen" }, 404);
  }

  const status = result.redirect
    ? 200
    : result.screen?.messages?.some((m) => m.type === "error")
      ? 400
      : 200;
  return c.json(result, status);
});

// ----------------------------------------
// Widget Pages (path-based routing)
// ----------------------------------------
app.get("/u2/login/identifier", async (c) => {
  const state =
    c.req.query("state") || "demo_" + Math.random().toString(36).substr(2, 9);
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "identifier",
      state,
      baseUrl,
      urlMode: "path",
      renderMode,
    }),
  );
});

// Identifier with 3 social providers (Google, Facebook, Apple)
app.get("/u2/login/identifier-social", async (c) => {
  const state =
    c.req.query("state") || "demo_" + Math.random().toString(36).substr(2, 9);
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "identifier",
      state,
      baseUrl,
      urlMode: "path",
      providers: "google-oauth2,facebook,apple",
      renderMode,
    }),
  );
});

app.get("/u2/enter-password", async (c) => {
  const state = c.req.query("state") || "demo";
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "enter-password",
      state,
      baseUrl,
      urlMode: "path",
      renderMode,
    }),
  );
});

app.get("/u2/enter-code", async (c) => {
  const state = c.req.query("state") || "demo";
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "enter-code",
      state,
      baseUrl,
      urlMode: "path",
      renderMode,
    }),
  );
});

app.get("/u2/signup", async (c) => {
  const state = c.req.query("state") || "demo";
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "signup",
      state,
      baseUrl,
      urlMode: "path",
      renderMode,
    }),
  );
});

app.get("/u2/forgot-password", async (c) => {
  const state = c.req.query("state") || "demo";
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "forgot-password",
      state,
      baseUrl,
      urlMode: "path",
      renderMode,
    }),
  );
});

app.get("/u2/success", async (c) => {
  const state = c.req.query("state") || "demo";
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: "success",
      state,
      baseUrl,
      urlMode: "path",
      renderMode,
    }),
  );
});

// ----------------------------------------
// Widget Page (query-based routing)
// ----------------------------------------
app.get("/u2/login", async (c) => {
  const screen = c.req.query("screen") || "identifier";
  const state =
    c.req.query("state") || "demo_" + Math.random().toString(36).substr(2, 9);
  const renderMode = parseRenderMode(c.req.query("renderMode"));
  const baseUrl = new URL(c.req.url).origin;
  return c.html(
    await renderWidgetPage({
      screenId: screen,
      state,
      baseUrl,
      urlMode: "query",
      renderMode,
    }),
  );
});

// ----------------------------------------
// OAuth Callback (mock)
// ----------------------------------------
app.get("/callback", (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  return c.html(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Auth Complete</title>
      <style>
        body { font-family: sans-serif; padding: 2rem; text-align: center; }
        .success { color: green; font-size: 2rem; }
        pre { background: #f0f0f0; padding: 1rem; border-radius: 8px; text-align: left; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="success">✓ Authentication Complete!</div>
      <p>In a real app, this would exchange the code for tokens.</p>
      <pre>
code: ${code}
state: ${state}
      </pre>
      <p><a href="/u2/login/identifier">Start Over</a></p>
    </body>
    </html>
  `);
});

// ----------------------------------------
// Root redirect
// ----------------------------------------
app.get("/", (c) => c.redirect("/u2/login/identifier"));

// ----------------------------------------
// Start Server
// ----------------------------------------
const port = 3456;
console.log(`
🚀 AuthHero Widget Demo Server
   
   Path-based:  http://localhost:${port}/u2/login/identifier
   With social: http://localhost:${port}/u2/login/identifier-social
   Query-based: http://localhost:${port}/u2/login?screen=identifier
   
   API Endpoints:
   - GET  /u2/screen/:screenId?state=xxx
   - POST /u2/screen/:screenId?state=xxx
`);

serve({ fetch: app.fetch, port });
