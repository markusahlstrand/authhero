/**
 * Test Fixtures for AuthHero Widget
 *
 * This module exports all screen fixtures and flow definitions
 * for testing the Server-Driven UI widget.
 */

// Screen fixtures
import loginScreen from './screens/login.json';
import loginWithSocialScreen from './screens/login-with-social.json';
import loginErrorScreen from './screens/login-error.json';
import signupScreen from './screens/signup.json';
import mfaTotpScreen from './screens/mfa-totp.json';
import mfaSmsScreen from './screens/mfa-sms.json';
import forgotPasswordScreen from './screens/forgot-password.json';
import resetPasswordScreen from './screens/reset-password.json';
import successScreen from './screens/success.json';
import emailVerificationScreen from './screens/email-verification.json';
import passwordlessEmailScreen from './screens/passwordless-email.json';
import brandedLoginScreen from './screens/branded-login.json';
import identifierScreen from './screens/identifier.json';

// Flow definitions
import loginFlow from './flows/login-flow.json';
import loginMfaFlow from './flows/login-mfa-flow.json';
import signupFlow from './flows/signup-flow.json';
import passwordResetFlow from './flows/password-reset-flow.json';

// Export individual screens
export const screens = {
  login: loginScreen,
  loginWithSocial: loginWithSocialScreen,
  loginError: loginErrorScreen,
  signup: signupScreen,
  mfaTotp: mfaTotpScreen,
  mfaSms: mfaSmsScreen,
  forgotPassword: forgotPasswordScreen,
  resetPassword: resetPasswordScreen,
  success: successScreen,
  emailVerification: emailVerificationScreen,
  passwordlessEmail: passwordlessEmailScreen,
  brandedLogin: brandedLoginScreen,
  identifier: identifierScreen,
} as const;

// Export flows
export const flows = {
  login: loginFlow,
  loginMfa: loginMfaFlow,
  signup: signupFlow,
  passwordReset: passwordResetFlow,
} as const;

// Default export for convenience
export default {
  screens,
  flows,
};
