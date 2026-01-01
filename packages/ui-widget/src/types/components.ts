/**
 * Auth0 Forms Component Types for Widget Rendering
 *
 * Based on Auth0 Forms API specification.
 * @see https://auth0.com/docs/customize/forms/forms-schema
 */

// =============================================================================
// Message Types
// =============================================================================

/**
 * Message type for validation and info messages.
 */
export type MessageType = 'info' | 'error' | 'success' | 'warning';

/**
 * A message that can be attached to components or screens.
 */
export interface ComponentMessage {
  /** Optional i18n message ID */
  id?: number;
  /** The message text */
  text: string;
  /** Message type */
  type: MessageType;
}

// =============================================================================
// Base Component Types
// =============================================================================

/**
 * Component categories following Auth0 Forms spec.
 */
export type ComponentCategory = 'BLOCK' | 'WIDGET' | 'FIELD';

/**
 * Base properties for all components.
 */
export interface ComponentBase {
  /** Unique component ID */
  id: string;
  /** Component type */
  type: string;
  /** Display order */
  order?: number;
  /** Whether the component is visible */
  visible?: boolean;
  /** Runtime validation messages */
  messages?: ComponentMessage[];
}

// =============================================================================
// BLOCK Components
// =============================================================================

export interface DividerComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'DIVIDER';
  config?: Record<string, never>;
}

export interface HtmlComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'HTML';
  config?: {
    content?: string;
  };
}

export interface ImageComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'IMAGE';
  config?: {
    src?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
}

export interface JumpButtonComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'JUMP_BUTTON';
  config: {
    text?: string;
    target_step?: string;
  };
}

export interface ResendButtonComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'RESEND_BUTTON';
  config: {
    text?: string;
    resend_action?: string;
  };
}

export interface NextButtonComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'NEXT_BUTTON';
  config: {
    text?: string;
  };
}

export interface PreviousButtonComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'PREVIOUS_BUTTON';
  config: {
    text?: string;
  };
}

export interface RichTextComponent extends ComponentBase {
  category: 'BLOCK';
  type: 'RICH_TEXT';
  config?: {
    content?: string;
  };
}

export type BlockComponent =
  | DividerComponent
  | HtmlComponent
  | ImageComponent
  | JumpButtonComponent
  | ResendButtonComponent
  | NextButtonComponent
  | PreviousButtonComponent
  | RichTextComponent;

// =============================================================================
// WIDGET Components
// =============================================================================

interface WidgetComponentBase extends ComponentBase {
  category: 'WIDGET';
  label?: string;
  hint?: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface VerifiableCredentialsWidget extends WidgetComponentBase {
  type: 'AUTH0_VERIFIABLE_CREDENTIALS';
  config: {
    credential_type?: string;
  };
}

export interface GmapsAddressWidget extends WidgetComponentBase {
  type: 'GMAPS_ADDRESS';
  config: {
    api_key?: string;
  };
}

export interface RecaptchaWidget extends WidgetComponentBase {
  type: 'RECAPTCHA';
  config: {
    site_key?: string;
  };
}

export type WidgetComponent =
  | VerifiableCredentialsWidget
  | GmapsAddressWidget
  | RecaptchaWidget;

// =============================================================================
// FIELD Components
// =============================================================================

interface FieldComponentBase extends ComponentBase {
  category: 'FIELD';
  label?: string;
  hint?: string;
  required?: boolean;
  sensitive?: boolean;
}

export interface BooleanField extends FieldComponentBase {
  type: 'BOOLEAN';
  config?: {
    default_value?: boolean;
  };
}

export interface CardsField extends FieldComponentBase {
  type: 'CARDS';
  config?: {
    options?: Array<{
      value: string;
      label: string;
      description?: string;
      image?: string;
    }>;
    multi_select?: boolean;
  };
}

export interface ChoiceField extends FieldComponentBase {
  type: 'CHOICE';
  config?: {
    options?: Array<{
      value: string;
      label: string;
    }>;
    display?: 'radio' | 'checkbox';
  };
}

export interface CustomField extends FieldComponentBase {
  type: 'CUSTOM';
  config: {
    component?: string;
    props?: Record<string, unknown>;
  };
}

export interface DateField extends FieldComponentBase {
  type: 'DATE';
  config?: {
    format?: string;
    min?: string;
    max?: string;
  };
}

export interface DropdownField extends FieldComponentBase {
  type: 'DROPDOWN';
  config?: {
    options?: Array<{
      value: string;
      label: string;
    }>;
    placeholder?: string;
    searchable?: boolean;
  };
}

export interface EmailField extends FieldComponentBase {
  type: 'EMAIL';
  config?: {
    placeholder?: string;
  };
}

export interface FileField extends FieldComponentBase {
  type: 'FILE';
  config?: {
    accept?: string;
    max_size?: number;
    multiple?: boolean;
  };
}

export interface LegalField extends FieldComponentBase {
  type: 'LEGAL';
  config?: {
    text: string;
    html?: boolean;
  };
}

export interface NumberField extends FieldComponentBase {
  type: 'NUMBER';
  config?: {
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
  };
}

export interface PasswordField extends FieldComponentBase {
  type: 'PASSWORD';
  config?: {
    placeholder?: string;
    min_length?: number;
    show_toggle?: boolean;
  };
}

export interface PaymentField extends FieldComponentBase {
  type: 'PAYMENT';
  config?: {
    provider?: string;
    currency?: string;
  };
}

export interface SocialField extends FieldComponentBase {
  type: 'SOCIAL';
  config?: {
    providers?: string[];
  };
}

export interface TelField extends FieldComponentBase {
  type: 'TEL';
  config?: {
    placeholder?: string;
    default_country?: string;
  };
}

export interface TextField extends FieldComponentBase {
  type: 'TEXT';
  config?: {
    placeholder?: string;
    multiline?: boolean;
    max_length?: number;
  };
}

export interface UrlField extends FieldComponentBase {
  type: 'URL';
  config?: {
    placeholder?: string;
  };
}

export type FieldComponent =
  | BooleanField
  | CardsField
  | ChoiceField
  | CustomField
  | DateField
  | DropdownField
  | EmailField
  | FileField
  | LegalField
  | NumberField
  | PasswordField
  | PaymentField
  | SocialField
  | TelField
  | TextField
  | UrlField;

// =============================================================================
// Union Types
// =============================================================================

/**
 * Union of all Auth0 Forms component types.
 */
export type FormComponent = BlockComponent | WidgetComponent | FieldComponent;

// =============================================================================
// Screen Type
// =============================================================================

/**
 * Navigation link displayed on the screen.
 */
export interface ScreenLink {
  /** Optional link ID */
  id?: string;
  /** Text before the link */
  text: string;
  /** Link URL */
  href: string;
  /** Optional clickable link text (if different from full text) */
  linkText?: string;
}

/**
 * Screen sent to the widget (simplified STEP for rendering).
 * This is what the API returns to the widget - no flow routing logic.
 */
export interface UiScreen {
  /** Form action URL */
  action: string;
  /** HTTP method */
  method: 'POST' | 'GET';
  /** Screen title */
  title?: string;
  /** Screen description */
  description?: string;
  /** Components to render (sorted by order) */
  components: FormComponent[];
  /** Screen-level messages (errors, info) */
  messages?: ComponentMessage[];
  /** Navigation links */
  links?: ScreenLink[];
}

// =============================================================================
// Type Guards
// =============================================================================

export function isBlockComponent(component: FormComponent): component is BlockComponent {
  return component.category === 'BLOCK';
}

export function isWidgetComponent(component: FormComponent): component is WidgetComponent {
  return component.category === 'WIDGET';
}

export function isFieldComponent(component: FormComponent): component is FieldComponent {
  return component.category === 'FIELD';
}
