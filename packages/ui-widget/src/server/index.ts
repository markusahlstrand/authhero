/**
 * Hono SSR Helper for AuthHero Widget
 *
 * This module provides utilities for server-side rendering
 * the AuthHero widget in Hono applications.
 */

import type { UIScreen, UINode, NodeType, InputType, ButtonType } from '../types/nodes';

export type { UIScreen, UINode, NodeType, InputType, ButtonType };

// Local type definitions for convenience
type ScreenBranding = {
  logo?: string;
  primaryColor?: string;
  backgroundColor?: string;
};

type ScreenLink = {
  text: string;
  href: string;
  type: 'forgot-password' | 'signup' | 'login' | 'back';
};

/**
 * Creates a basic login screen configuration
 */
export function createLoginScreen(options: {
  action: string;
  title?: string;
  showSocialProviders?: string[];
  showForgotPassword?: boolean;
  showSignUp?: boolean;
  branding?: ScreenBranding;
}): UIScreen {
  const nodes: UINode[] = [
    {
      id: 'email',
      type: 'input',
      attributes: {
        name: 'email',
        type: 'email',
        required: true,
        autocomplete: 'email',
      },
      meta: {
        label: 'Email address',
      },
    },
    {
      id: 'password',
      type: 'input',
      attributes: {
        name: 'password',
        type: 'password',
        required: true,
        autocomplete: 'current-password',
      },
      meta: {
        label: 'Password',
      },
    },
    {
      id: 'submit',
      type: 'button',
      attributes: {
        type: 'submit',
      },
      meta: {
        label: 'Sign in',
      },
    },
  ];

  // Add social providers if specified
  if (options.showSocialProviders?.length) {
    nodes.push({
      id: 'divider',
      type: 'divider',
      meta: {
        label: 'or',
      },
    });

    options.showSocialProviders.forEach((provider) => {
      nodes.push({
        id: `social-${provider}`,
        type: 'social-button',
        attributes: {
          provider,
        },
        meta: {
          label: `Continue with ${provider.charAt(0).toUpperCase() + provider.slice(1)}`,
        },
      });
    });
  }

  const links: ScreenLink[] = [];

  if (options.showForgotPassword !== false) {
    links.push({
      text: 'Forgot your password?',
      href: '/forgot-password',
      type: 'forgot-password',
    });
  }

  if (options.showSignUp !== false) {
    links.push({
      text: "Don't have an account? Sign up",
      href: '/signup',
      type: 'signup',
    });
  }

  return {
    id: 'login',
    title: options.title || 'Sign in to your account',
    action: options.action,
    method: 'POST',
    nodes,
    meta: {
      branding: options.branding,
      links,
    },
  };
}

/**
 * Creates an identifier-first screen (email first, then password or social)
 */
export function createIdentifierScreen(options: {
  action: string;
  title?: string;
  tenantName?: string;
  logoUrl?: string;
  showSocialProviders?: string[];
  showSignUp?: boolean;
  signUpUrl?: string;
  branding?: ScreenBranding;
}): UIScreen {
  const nodes: UINode[] = [];

  // Add logo if provided
  if (options.logoUrl) {
    nodes.push({
      id: 'logo',
      type: 'image',
      attributes: {
        src: options.logoUrl,
        alt: `${options.tenantName || 'Company'} Logo`,
      },
    });
  }

  // Email input
  nodes.push({
    id: 'email',
    type: 'input',
    attributes: {
      name: 'email',
      type: 'email',
      required: true,
      placeholder: 'Your email address',
      autocomplete: 'email',
    },
    meta: {
      label: 'Email',
    },
  });

  // Continue button
  nodes.push({
    id: 'submit',
    type: 'button',
    attributes: {
      type: 'submit',
    },
    meta: {
      label: 'Continue',
    },
  });

  // Add social providers if specified
  if (options.showSocialProviders?.length) {
    nodes.push({
      id: 'divider',
      type: 'divider',
      meta: {
        label: 'OR',
      },
    });

    options.showSocialProviders.forEach((provider) => {
      nodes.push({
        id: `social-${provider}`,
        type: 'social-button',
        attributes: {
          provider,
        },
        meta: {
          label: `Continue with ${provider.charAt(0).toUpperCase() + provider.slice(1)}`,
        },
      });
    });
  }

  const links: Array<{
    text: string;
    href: string;
    type: 'forgot-password' | 'signup' | 'login' | 'back';
    linkText?: string;
  }> = [];

  if (options.showSignUp !== false) {
    links.push({
      text: "Don't have an account?",
      href: options.signUpUrl || '/signup',
      type: 'signup',
      linkText: 'Get started',
    });
  }

  return {
    id: 'identifier',
    title: options.title || `Sign in to ${options.tenantName || 'your account'}`,
    action: options.action,
    method: 'POST',
    nodes,
    meta: {
      branding: options.branding,
      links,
    },
  };
}

/**
 * Creates a registration screen configuration
 */
export function createSignupScreen(options: {
  action: string;
  title?: string;
  fields?: Array<{
    name: string;
    type?: InputType;
    label: string;
    required?: boolean;
    placeholder?: string;
  }>;
  showSocialProviders?: string[];
  showLogin?: boolean;
  branding?: ScreenBranding;
}): UIScreen {
  const defaultFields: Array<{
    name: string;
    type: InputType;
    label: string;
    required: boolean;
    placeholder?: string;
  }> = [
    { name: 'email', type: 'email', label: 'Email address', required: true },
    { name: 'password', type: 'password', label: 'Password', required: true },
    {
      name: 'password_confirm',
      type: 'password',
      label: 'Confirm password',
      required: true,
    },
  ];

  const fields = options.fields || defaultFields;

  const nodes: UINode[] = fields.map((field, index) => ({
    id: field.name || `field-${index}`,
    type: 'input' as NodeType,
    attributes: {
      name: field.name,
      type: field.type || 'text',
      required: field.required ?? true,
      placeholder: field.placeholder,
    },
    meta: {
      label: field.label,
    },
  }));

  nodes.push({
    id: 'submit',
    type: 'button',
    attributes: {
      type: 'submit',
    },
    meta: {
      label: 'Create account',
    },
  });

  // Add social providers if specified
  if (options.showSocialProviders?.length) {
    nodes.push({
      id: 'divider',
      type: 'divider',
      meta: {
        label: 'or',
      },
    });

    options.showSocialProviders.forEach((provider) => {
      nodes.push({
        id: `social-${provider}`,
        type: 'social-button',
        attributes: {
          provider,
        },
        meta: {
          label: `Continue with ${provider.charAt(0).toUpperCase() + provider.slice(1)}`,
        },
      });
    });
  }

  const links: ScreenLink[] = [];

  if (options.showLogin !== false) {
    links.push({
      text: 'Already have an account? Sign in',
      href: '/login',
      type: 'login',
    });
  }

  return {
    id: 'signup',
    title: options.title || 'Create your account',
    action: options.action,
    method: 'POST',
    nodes,
    meta: {
      branding: options.branding,
      links,
    },
  };
}

/**
 * Creates an MFA verification screen
 */
export function createMfaScreen(options: {
  action: string;
  title?: string;
  codeLength?: number;
  method?: 'totp' | 'sms' | 'email';
  branding?: ScreenBranding;
}): UIScreen {
  return {
    id: 'mfa',
    title: options.title || 'Two-factor authentication',
    action: options.action,
    method: 'POST',
    nodes: [
      {
        id: 'description',
        type: 'text',
        meta: {
          description:
            options.method === 'sms'
              ? 'Enter the code sent to your phone'
              : options.method === 'email'
                ? 'Enter the code sent to your email'
                : 'Enter the code from your authenticator app',
        },
      },
      {
        id: 'code',
        type: 'input',
        attributes: {
          name: 'code',
          type: 'otp',
          required: true,
          maxLength: options.codeLength || 6,
          autocomplete: 'one-time-code',
          pattern: `[0-9]{${options.codeLength || 6}}`,
        },
        meta: {
          label: 'Verification code',
        },
      },
      {
        id: 'submit',
        type: 'button',
        attributes: {
          type: 'submit',
        },
        meta: {
          label: 'Verify',
        },
      },
    ],
    meta: {
      branding: options.branding,
      links: [
        {
          text: 'Back to login',
          href: '/login',
          type: 'back',
        },
      ],
    },
  };
}

/**
 * Creates a password reset request screen
 */
export function createForgotPasswordScreen(options: {
  action: string;
  title?: string;
  branding?: ScreenBranding;
}): UIScreen {
  return {
    id: 'forgot-password',
    title: options.title || 'Reset your password',
    action: options.action,
    method: 'POST',
    nodes: [
      {
        id: 'description',
        type: 'text',
        meta: {
          description: "Enter your email address and we'll send you a link to reset your password.",
        },
      },
      {
        id: 'email',
        type: 'input',
        attributes: {
          name: 'email',
          type: 'email',
          required: true,
          autocomplete: 'email',
        },
        meta: {
          label: 'Email address',
        },
      },
      {
        id: 'submit',
        type: 'button',
        attributes: {
          type: 'submit',
        },
        meta: {
          label: 'Send reset link',
        },
      },
    ],
    meta: {
      branding: options.branding,
      links: [
        {
          text: 'Back to login',
          href: '/login',
          type: 'back',
        },
      ],
    },
  };
}

/**
 * Adds an error message to a screen
 */
export function withError(screen: UIScreen, error: string): UIScreen {
  return {
    ...screen,
    messages: {
      ...screen.messages,
      error,
    },
  };
}

/**
 * Adds a success message to a screen
 */
export function withSuccess(screen: UIScreen, success: string): UIScreen {
  return {
    ...screen,
    messages: {
      ...screen.messages,
      success,
    },
  };
}

/**
 * Adds a field-level error to a specific node
 */
export function withFieldError(screen: UIScreen, nodeId: string, error: string): UIScreen {
  return {
    ...screen,
    nodes: screen.nodes.map((node: UINode) =>
      node.id === nodeId
        ? {
            ...node,
            messages: {
              ...node.messages,
              error,
            },
          }
        : node
    ),
  };
}
