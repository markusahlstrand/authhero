/**
 * Built-in screens for Universal Login
 *
 * These screens are defined in code and match the existing universal login routes.
 * They can be rendered by the widget component either client-side or server-side (SSR).
 *
 * Screen IDs match the existing route paths:
 * - identifier: /u/login/identifier
 * - enter-code: /u/enter-code
 * - enter-password: /u/enter-password
 * - signup: /u/signup
 * - forgot-password: /u/forgot-password
 * - reset-password: /u/reset-password
 * - impersonate: /u/impersonate
 * - pre-signup: /u/pre-signup
 * - pre-signup-sent: /u/pre-signup-sent
 */

export { identifierScreen } from "./identifier";
export { enterCodeScreen } from "./enter-code";
export { enterPasswordScreen } from "./enter-password";
export { signupScreen } from "./signup";
export { forgotPasswordScreen } from "./forgot-password";
export { resetPasswordScreen } from "./reset-password";
export { impersonateScreen } from "./impersonate";

// Export types
export type { ScreenContext, ScreenFactory, ScreenResult } from "./types";

// Export the screen registry
export { getScreen, screenRegistry } from "./registry";

// Export custom text utilities
export { getCustomText, getErrorText } from "./custom-text-utils";
