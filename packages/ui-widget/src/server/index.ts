/**
 * Hono SSR Helper for AuthHero Widget
 *
 * This module provides utilities for server-side rendering
 * the AuthHero widget in Hono applications.
 */

import type {
  UiScreen,
  FormComponent,
  ScreenLink,
  ComponentMessage,
  EmailField,
  PasswordField,
  TextField,
  DividerComponent,
  NextButtonComponent,
  SocialField,
  RichTextComponent,
  ImageComponent,
} from '../types/components';

// Re-export the types
export type { UiScreen, FormComponent, ScreenLink, ComponentMessage };

// Local type definitions for convenience
type ScreenBranding = {
  logo_url?: string;
  primaryColor?: string;
  backgroundColor?: string;
};

/**
 * Creates a basic login screen configuration using the new UiScreen format.
 */
export function createLoginScreen(options: {
  action: string;
  title?: string;
  showSocialProviders?: string[];
  showForgotPassword?: boolean;
  showSignUp?: boolean;
  branding?: ScreenBranding;
}): UiScreen {
  const components: FormComponent[] = [];
  let order = 0;

  // Email field
  components.push({
    id: 'email',
    category: 'FIELD',
    type: 'EMAIL',
    order: order++,
    label: 'Email address',
    required: true,
    config: {
      placeholder: 'you@example.com',
    },
  } satisfies EmailField);

  // Password field
  components.push({
    id: 'password',
    category: 'FIELD',
    type: 'PASSWORD',
    order: order++,
    label: 'Password',
    required: true,
    config: {
      placeholder: 'Enter your password',
    },
  } satisfies PasswordField);

  // Submit button
  components.push({
    id: 'submit',
    category: 'BLOCK',
    type: 'NEXT_BUTTON',
    order: order++,
    config: {
      text: 'Sign in',
    },
  } satisfies NextButtonComponent);

  // Add social providers if specified
  if (options.showSocialProviders?.length) {
    components.push({
      id: 'divider',
      category: 'BLOCK',
      type: 'DIVIDER',
      order: order++,
    } satisfies DividerComponent);

    components.push({
      id: 'social',
      category: 'FIELD',
      type: 'SOCIAL',
      order: order++,
      config: {
        providers: options.showSocialProviders,
      },
    } satisfies SocialField);
  }

  const links: ScreenLink[] = [];

  if (options.showForgotPassword !== false) {
    links.push({
      text: 'Forgot your password?',
      href: '/forgot-password',
    });
  }

  if (options.showSignUp !== false) {
    links.push({
      text: "Don't have an account?",
      href: '/signup',
      linkText: 'Sign up',
    });
  }

  return {
    title: options.title || 'Sign in to your account',
    action: options.action,
    method: 'POST',
    components,
    links,
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
}): UiScreen {
  const components: FormComponent[] = [];
  let order = 0;

  // Add logo if provided
  if (options.logoUrl) {
    components.push({
      id: 'logo',
      category: 'BLOCK',
      type: 'IMAGE',
      order: order++,
      config: {
        src: options.logoUrl,
        alt: `${options.tenantName || 'Company'} Logo`,
      },
    } satisfies ImageComponent);
  }

  // Email input
  components.push({
    id: 'email',
    category: 'FIELD',
    type: 'EMAIL',
    order: order++,
    label: 'Email',
    required: true,
    config: {
      placeholder: 'Your email address',
    },
  } satisfies EmailField);

  // Continue button
  components.push({
    id: 'submit',
    category: 'BLOCK',
    type: 'NEXT_BUTTON',
    order: order++,
    config: {
      text: 'Continue',
    },
  } satisfies NextButtonComponent);

  // Add social providers if specified
  if (options.showSocialProviders?.length) {
    components.push({
      id: 'divider',
      category: 'BLOCK',
      type: 'DIVIDER',
      order: order++,
    } satisfies DividerComponent);

    components.push({
      id: 'social',
      category: 'FIELD',
      type: 'SOCIAL',
      order: order++,
      config: {
        providers: options.showSocialProviders,
      },
    } satisfies SocialField);
  }

  const links: ScreenLink[] = [];

  if (options.showSignUp !== false) {
    links.push({
      text: "Don't have an account?",
      href: options.signUpUrl || '/signup',
      linkText: 'Get started',
    });
  }

  return {
    title: options.title || `Sign in to ${options.tenantName || 'your account'}`,
    action: options.action,
    method: 'POST',
    components,
    links,
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
    type?: 'email' | 'password' | 'text' | 'tel' | 'url' | 'number' | 'date';
    label: string;
    required?: boolean;
    placeholder?: string;
  }>;
  showSocialProviders?: string[];
  showLogin?: boolean;
  branding?: ScreenBranding;
}): UiScreen {
  const defaultFields: Array<{
    name: string;
    type: 'email' | 'password' | 'text';
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
  const components: FormComponent[] = [];
  let order = 0;

  // Map fields to components
  fields.forEach((field) => {
    const fieldType = field.type || 'text';

    if (fieldType === 'email') {
      components.push({
        id: field.name,
        category: 'FIELD',
        type: 'EMAIL',
        order: order++,
        label: field.label,
        required: field.required ?? true,
        config: {
          placeholder: field.placeholder,
        },
      } satisfies EmailField);
    } else if (fieldType === 'password') {
      components.push({
        id: field.name,
        category: 'FIELD',
        type: 'PASSWORD',
        order: order++,
        label: field.label,
        required: field.required ?? true,
        config: {
          placeholder: field.placeholder,
        },
      } satisfies PasswordField);
    } else {
      components.push({
        id: field.name,
        category: 'FIELD',
        type: 'TEXT',
        order: order++,
        label: field.label,
        required: field.required ?? true,
        config: {
          placeholder: field.placeholder,
        },
      } satisfies TextField);
    }
  });

  // Submit button
  components.push({
    id: 'submit',
    category: 'BLOCK',
    type: 'NEXT_BUTTON',
    order: order++,
    config: {
      text: 'Create account',
    },
  } satisfies NextButtonComponent);

  // Add social providers if specified
  if (options.showSocialProviders?.length) {
    components.push({
      id: 'divider',
      category: 'BLOCK',
      type: 'DIVIDER',
      order: order++,
    } satisfies DividerComponent);

    components.push({
      id: 'social',
      category: 'FIELD',
      type: 'SOCIAL',
      order: order++,
      config: {
        providers: options.showSocialProviders,
      },
    } satisfies SocialField);
  }

  const links: ScreenLink[] = [];

  if (options.showLogin !== false) {
    links.push({
      text: 'Already have an account?',
      href: '/login',
      linkText: 'Sign in',
    });
  }

  return {
    title: options.title || 'Create your account',
    action: options.action,
    method: 'POST',
    components,
    links,
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
}): UiScreen {
  const components: FormComponent[] = [];
  let order = 0;

  const description =
    options.method === 'sms'
      ? 'Enter the code sent to your phone'
      : options.method === 'email'
        ? 'Enter the code sent to your email'
        : 'Enter the code from your authenticator app';

  // Description text
  components.push({
    id: 'description',
    category: 'BLOCK',
    type: 'RICH_TEXT',
    order: order++,
    config: {
      content: `<p>${description}</p>`,
    },
  } satisfies RichTextComponent);

  // Code input
  components.push({
    id: 'code',
    category: 'FIELD',
    type: 'TEXT',
    order: order++,
    label: 'Verification code',
    required: true,
    config: {
      placeholder: '000000',
      max_length: options.codeLength || 6,
    },
  } satisfies TextField);

  // Submit button
  components.push({
    id: 'submit',
    category: 'BLOCK',
    type: 'NEXT_BUTTON',
    order: order++,
    config: {
      text: 'Verify',
    },
  } satisfies NextButtonComponent);

  return {
    title: options.title || 'Two-factor authentication',
    action: options.action,
    method: 'POST',
    components,
    links: [
      {
        text: 'Back to login',
        href: '/login',
      },
    ],
  };
}

/**
 * Creates a password reset request screen
 */
export function createForgotPasswordScreen(options: {
  action: string;
  title?: string;
  branding?: ScreenBranding;
}): UiScreen {
  const components: FormComponent[] = [];
  let order = 0;

  // Description text
  components.push({
    id: 'description',
    category: 'BLOCK',
    type: 'RICH_TEXT',
    order: order++,
    config: {
      content: "<p>Enter your email address and we'll send you a link to reset your password.</p>",
    },
  } satisfies RichTextComponent);

  // Email input
  components.push({
    id: 'email',
    category: 'FIELD',
    type: 'EMAIL',
    order: order++,
    label: 'Email address',
    required: true,
  } satisfies EmailField);

  // Submit button
  components.push({
    id: 'submit',
    category: 'BLOCK',
    type: 'NEXT_BUTTON',
    order: order++,
    config: {
      text: 'Send reset link',
    },
  } satisfies NextButtonComponent);

  return {
    title: options.title || 'Reset your password',
    action: options.action,
    method: 'POST',
    components,
    links: [
      {
        text: 'Back to login',
        href: '/login',
      },
    ],
  };
}

/**
 * Adds an error message to a screen
 */
export function withError(screen: UiScreen, error: string): UiScreen {
  return {
    ...screen,
    messages: [
      ...(screen.messages || []),
      { text: error, type: 'error' },
    ],
  };
}

/**
 * Adds a success message to a screen
 */
export function withSuccess(screen: UiScreen, success: string): UiScreen {
  return {
    ...screen,
    messages: [
      ...(screen.messages || []),
      { text: success, type: 'success' },
    ],
  };
}

/**
 * Recursively add an error message to a component by ID.
 * Handles nested components if they have a 'components' or 'children' property.
 */
function addErrorToComponent<T extends { id: string; messages?: Array<{ text: string; type: string }> }>(
  component: T,
  componentId: string,
  error: string
): T {
  // Check if this is the target component
  if (component.id === componentId) {
    return {
      ...component,
      messages: [
        ...((component.messages as Array<{ text: string; type: string }>) || []),
        { text: error, type: 'error' },
      ],
    };
  }

  // Check for nested components (new format might use 'components')
  const componentWithChildren = component as T & { components?: T[]; children?: T[] };
  
  if (componentWithChildren.components?.length) {
    return {
      ...component,
      components: componentWithChildren.components.map((child) =>
        addErrorToComponent(child, componentId, error)
      ),
    } as T;
  }

  // Check for nested children (deprecated UINode format)
  if (componentWithChildren.children?.length) {
    return {
      ...component,
      children: componentWithChildren.children.map((child) =>
        addErrorToComponent(child, componentId, error)
      ),
    } as T;
  }

  return component;
}

/**
 * Adds a field-level error to a specific component.
 * Recursively searches nested components/children.
 */
export function withFieldError(screen: UiScreen, componentId: string, error: string): UiScreen {
  return {
    ...screen,
    components: screen.components.map((component) =>
      addErrorToComponent(component, componentId, error)
    ),
  };
}
