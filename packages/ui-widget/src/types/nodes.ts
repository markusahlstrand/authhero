/**
 * UI Node Types for Server-Driven UI
 *
 * Inspired by Ory Kratos UI Node schema.
 * @see https://www.ory.sh/docs/kratos/concepts/ui-user-interface
 */

// =============================================================================
// Ory Kratos Compatible Types
// =============================================================================

/**
 * Node types following Ory Kratos patterns.
 * - input: Form inputs including submit buttons
 * - img: Images
 * - a: Anchor/links
 * - text: Text content (headings, paragraphs)
 * - script: Scripts (rarely used)
 */
export type UiNodeType = 'input' | 'img' | 'a' | 'text' | 'script';

/**
 * Node groups for categorizing form fields.
 * Following Ory Kratos group naming.
 */
export type UiNodeGroup =
  | 'default'
  | 'identifier_first'
  | 'password'
  | 'oidc'
  | 'totp'
  | 'webauthn'
  | 'lookup_secret'
  | 'profile'
  | 'link';

/**
 * Input types for input nodes.
 */
export type UiNodeInputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'number'
  | 'hidden'
  | 'checkbox'
  | 'submit'
  | 'button';

/**
 * Message types for validation and info messages.
 */
export type UiTextType = 'info' | 'error' | 'success';

/**
 * A text message with optional i18n ID.
 * Following Ory's UiText pattern.
 */
export interface UiText {
  /** i18n message ID for translation lookup */
  id?: number;
  /** The message text */
  text: string;
  /** Message type */
  type: UiTextType;
  /** Additional context for the message */
  context?: Record<string, unknown>;
}

/**
 * Attributes for input nodes.
 * Following Ory's UiNodeInputAttributes.
 */
export interface UiNodeInputAttributes {
  /** Attribute discriminator */
  node_type: 'input';
  /** Input name for form submission */
  name: string;
  /** HTML input type */
  type: UiNodeInputType;
  /** Current value */
  value?: string | number | boolean;
  /** Whether the field is required */
  required?: boolean;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Autocomplete hint */
  autocomplete?:
    | 'email'
    | 'current-password'
    | 'new-password'
    | 'username'
    | 'one-time-code'
    | 'name'
    | 'tel'
    | 'off';
  /** Validation pattern */
  pattern?: string;
  /** Maximum length */
  maxlength?: number;
  /** Label (for buttons, used in submit buttons) */
  label?: UiText;
  /** onclick handler name (for OIDC buttons) */
  onclick?: string;
}

/**
 * Attributes for image nodes.
 * Following Ory's UiNodeImageAttributes.
 */
export interface UiNodeImageAttributes {
  /** Attribute discriminator */
  node_type: 'img';
  /** Image source URL */
  src: string;
  /** Alt text */
  alt?: string;
  /** Image ID */
  id: string;
  /** Width */
  width?: number;
  /** Height */
  height?: number;
}

/**
 * Attributes for anchor/link nodes.
 * Following Ory's UiNodeAnchorAttributes.
 */
export interface UiNodeAnchorAttributes {
  /** Attribute discriminator */
  node_type: 'a';
  /** Link URL */
  href: string;
  /** Link title */
  title: UiText;
  /** Link ID */
  id: string;
}

/**
 * Attributes for text nodes.
 * Following Ory's UiNodeTextAttributes.
 */
export interface UiNodeTextAttributes {
  /** Attribute discriminator */
  node_type: 'text';
  /** Text content */
  text: UiText;
  /** Text ID */
  id: string;
}

/**
 * Attributes for script nodes.
 * Following Ory's UiNodeScriptAttributes.
 */
export interface UiNodeScriptAttributes {
  /** Attribute discriminator */
  node_type: 'script';
  /** Script source URL */
  src: string;
  /** Whether to load async */
  async: boolean;
  /** Referrer policy */
  referrerpolicy?: string;
  /** Cross-origin setting */
  crossorigin?: string;
  /** Integrity hash */
  integrity?: string;
  /** Nonce */
  nonce?: string;
  /** Script type */
  type?: string;
  /** Script ID */
  id: string;
}

/**
 * Union of all attribute types.
 */
export type UiNodeAttributes =
  | UiNodeInputAttributes
  | UiNodeImageAttributes
  | UiNodeAnchorAttributes
  | UiNodeTextAttributes
  | UiNodeScriptAttributes;

/**
 * Node metadata, primarily for labels.
 * Following Ory's UiNodeMeta.
 */
export interface UiNodeMeta {
  /** Label for the node */
  label?: UiText;
}

/**
 * A UI node representing a single form element.
 * Following Ory's UiNode structure.
 */
export interface UiNode {
  /** Node type */
  type: UiNodeType;
  /** Node group for categorization */
  group: UiNodeGroup;
  /** Node-specific attributes */
  attributes: UiNodeAttributes;
  /** Validation and info messages */
  messages: UiText[];
  /** Node metadata (labels) */
  meta: UiNodeMeta;
}

/**
 * A UI container representing a full screen/form.
 * Following Ory's UiContainer structure.
 */
export interface UiContainer {
  /** Form action URL */
  action: string;
  /** HTTP method */
  method: 'GET' | 'POST';
  /** UI nodes to render */
  nodes: UiNode[];
  /** Screen-level messages */
  messages?: UiText[];
}

// =============================================================================
// AuthHero Extensions
// =============================================================================
// These extend Ory's schema for AuthHero-specific features.
// Clearly documented as non-standard extensions.

/**
 * Extended UI container with AuthHero-specific metadata.
 * Extends Ory's UiContainer with branding and navigation.
 */
export interface UiScreen extends UiContainer {
  /** Screen identifier */
  id: string;
  /** Screen title (AuthHero extension) */
  title?: string;
  /** AuthHero-specific UI metadata */
  ui?: {
    /** Branding configuration */
    branding?: {
      logo_url?: string;
      primary_color?: string;
      background_color?: string;
    };
    /** Navigation links */
    links?: Array<{
      id: string;
      text: string;
      href: string;
      /** Optional separate link text */
      link_text?: string;
    }>;
  };
}

// =============================================================================
// Legacy Types (Deprecated - for backwards compatibility)
// =============================================================================

/** @deprecated Use UiNodeType instead */
export type NodeType =
  | 'input'
  | 'button'
  | 'text'
  | 'image'
  | 'link'
  | 'divider'
  | 'social-button'
  | 'error'
  | 'success'
  | 'container';

/** @deprecated Use UiNodeInputType instead */
export type InputType =
  | 'text'
  | 'email'
  | 'password'
  | 'tel'
  | 'number'
  | 'hidden'
  | 'checkbox'
  | 'radio'
  | 'otp';

/** @deprecated Use 'submit' | 'button' instead */
export type ButtonType = 'submit' | 'button' | 'reset';

/** @deprecated Use UiNodeAttributes instead */
export interface NodeAttributes {
  name?: string;
  type?: InputType | ButtonType;
  value?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  autocomplete?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  href?: string;
  src?: string;
  alt?: string;
  provider?: string;
  className?: string;
}

/** @deprecated Use UiNodeMeta instead */
export interface NodeMeta {
  label?: string;
  helperText?: string;
  title?: string;
  description?: string;
  icon?: string;
}

/** @deprecated Use UiText[] instead */
export interface NodeMessage {
  error?: string;
  warning?: string;
  success?: string;
  info?: string;
}

/** @deprecated Groups are now represented via UiNode.group field */
export interface NodeGroup {
  id: string;
  nodes: UINode[];
  direction?: 'horizontal' | 'vertical';
}

/** @deprecated Use UiNode instead */
export interface UINode {
  id: string;
  type: NodeType;
  attributes?: NodeAttributes;
  meta?: NodeMeta;
  messages?: NodeMessage;
  children?: UINode[];
  group?: string;
}

/** @deprecated Use UiScreen instead */
export interface UIScreen {
  id: string;
  title?: string;
  action: string;
  method: 'GET' | 'POST';
  nodes: UINode[];
  messages?: NodeMessage;
  meta?: {
    branding?: {
      logo?: string;
      primaryColor?: string;
      backgroundColor?: string;
    };
    links?: Array<{
      text: string;
      href: string;
      type: 'forgot-password' | 'signup' | 'login' | 'back';
      linkText?: string;
    }>;
  };
}
