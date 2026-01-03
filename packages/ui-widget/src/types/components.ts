/**
 * Auth0 Forms Component Types for Widget Rendering
 *
 * Re-exported from @authhero/adapter-interfaces for consistency.
 * @see https://auth0.com/docs/customize/forms/forms-schema
 */

export type {
  // Message types
  ComponentMessage,

  // Union types
  FormNodeComponent as FormComponent,
  RuntimeComponent,
  BlockComponent,
  WidgetComponent,
  FieldComponent,

  // Individual BLOCK component types
  DividerComponent,
  HtmlComponent,
  ImageComponent,
  JumpButtonComponent,
  ResendButtonComponent,
  NextButtonComponent,
  PreviousButtonComponent,
  RichTextComponent,

  // Individual WIDGET component types
  VerifiableCredentialsWidget,
  GmapsAddressWidget,
  RecaptchaWidget,

  // Individual FIELD component types
  BooleanField,
  CardsField,
  ChoiceField,
  CustomField,
  DateField,
  DropdownField,
  EmailField,
  FileField,
  LegalField,
  NumberField,
  PasswordField,
  PaymentField,
  SocialField,
  TelField,
  TextField,
  UrlField,

  // Screen types
  ScreenLink,
  UiScreen,
} from "@authhero/adapter-interfaces";

// Re-export type guards
export {
  isBlockComponent,
  isWidgetComponent,
  isFieldComponent,
} from "@authhero/adapter-interfaces";
