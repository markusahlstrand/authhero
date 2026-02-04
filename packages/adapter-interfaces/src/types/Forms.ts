import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

/**
 * Auth0 Forms Component Schema
 * Based on official Auth0 Forms API specification
 * @see https://auth0.com/docs/customize/forms/forms-schema
 */

// =============================================================================
// Base Schemas
// =============================================================================

/**
 * Base schema for all form node components
 */
const formNodeComponentBase = z.object({
  id: z.string(),
  order: z.number().optional(),
  visible: z.boolean().optional().default(true),
});

// =============================================================================
// BLOCK Components (non-input elements)
// =============================================================================

const blockComponentBase = formNodeComponentBase.extend({
  category: z.literal("BLOCK").optional(),
});

const dividerComponent = blockComponentBase.extend({
  type: z.literal("DIVIDER"),
  config: z.object({}).optional(),
});

const htmlComponent = blockComponentBase.extend({
  type: z.literal("HTML"),
  config: z
    .object({
      content: z.string().optional(),
    })
    .optional(),
});

const imageComponent = blockComponentBase.extend({
  type: z.literal("IMAGE"),
  config: z
    .object({
      src: z.string().optional(),
      alt: z.string().optional(),
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional(),
});

const jumpButtonComponent = blockComponentBase.extend({
  type: z.literal("JUMP_BUTTON"),
  config: z.object({
    text: z.string().optional(),
    target_step: z.string().optional(),
  }),
});

const resendButtonComponent = blockComponentBase.extend({
  type: z.literal("RESEND_BUTTON"),
  config: z.object({
    text: z.string().optional(),
    resend_action: z.string().optional(),
  }),
});

const nextButtonComponent = blockComponentBase.extend({
  type: z.literal("NEXT_BUTTON"),
  config: z.object({
    text: z.string().optional(),
  }),
});

const previousButtonComponent = blockComponentBase.extend({
  type: z.literal("PREVIOUS_BUTTON"),
  config: z.object({
    text: z.string().optional(),
  }),
});

const richTextComponent = blockComponentBase.extend({
  type: z.literal("RICH_TEXT"),
  config: z
    .object({
      content: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// WIDGET Components (third-party integrations)
// =============================================================================

const widgetComponentBase = formNodeComponentBase.extend({
  category: z.literal("WIDGET").optional(),
  label: z.string().min(1).optional(),
  hint: z.string().min(1).max(500).optional(),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
});

const verifiableCredentialsWidget = widgetComponentBase.extend({
  type: z.literal("AUTH0_VERIFIABLE_CREDENTIALS"),
  config: z.object({
    credential_type: z.string().optional(),
  }),
});

const gmapsAddressWidget = widgetComponentBase.extend({
  type: z.literal("GMAPS_ADDRESS"),
  config: z.object({
    api_key: z.string().optional(),
  }),
});

const recaptchaWidget = widgetComponentBase.extend({
  type: z.literal("RECAPTCHA"),
  config: z.object({
    site_key: z.string().optional(),
  }),
});

// =============================================================================
// FIELD Components (input elements)
// =============================================================================

const fieldComponentBase = formNodeComponentBase.extend({
  category: z.literal("FIELD").optional(),
  label: z.string().min(1).optional(),
  hint: z.string().min(1).max(500).optional(),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
});

const booleanField = fieldComponentBase.extend({
  type: z.literal("BOOLEAN"),
  config: z
    .object({
      default_value: z.boolean().optional(),
    })
    .optional(),
});

const cardsField = fieldComponentBase.extend({
  type: z.literal("CARDS"),
  config: z
    .object({
      options: z
        .array(
          z.object({
            value: z.string(),
            label: z.string(),
            description: z.string().optional(),
            image: z.string().optional(),
          }),
        )
        .optional(),
      multi_select: z.boolean().optional(),
    })
    .optional(),
});

const choiceField = fieldComponentBase.extend({
  type: z.literal("CHOICE"),
  config: z
    .object({
      options: z
        .array(
          z.object({
            value: z.string(),
            label: z.string(),
          }),
        )
        .optional(),
      display: z.enum(["radio", "checkbox"]).optional(),
    })
    .optional(),
});

const customField = fieldComponentBase.extend({
  type: z.literal("CUSTOM"),
  config: z.object({
    component: z.string().optional(),
    props: z.record(z.any()).optional(),
  }),
});

const dateField = fieldComponentBase.extend({
  type: z.literal("DATE"),
  config: z
    .object({
      format: z.string().optional(),
      min: z.string().optional(),
      max: z.string().optional(),
    })
    .optional(),
});

const dropdownField = fieldComponentBase.extend({
  type: z.literal("DROPDOWN"),
  config: z
    .object({
      options: z
        .array(
          z.object({
            value: z.string(),
            label: z.string(),
          }),
        )
        .optional(),
      placeholder: z.string().optional(),
      searchable: z.boolean().optional(),
    })
    .optional(),
});

const emailField = fieldComponentBase.extend({
  type: z.literal("EMAIL"),
  config: z
    .object({
      placeholder: z.string().optional(),
    })
    .optional(),
});

const fileField = fieldComponentBase.extend({
  type: z.literal("FILE"),
  config: z
    .object({
      accept: z.string().optional(),
      max_size: z.number().optional(),
      multiple: z.boolean().optional(),
    })
    .optional(),
});

const legalField = fieldComponentBase.extend({
  type: z.literal("LEGAL"),
  config: z
    .object({
      text: z.string(),
      html: z.boolean().optional(),
    })
    .optional(),
});

const numberField = fieldComponentBase.extend({
  type: z.literal("NUMBER"),
  config: z
    .object({
      placeholder: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
    })
    .optional(),
});

const passwordField = fieldComponentBase.extend({
  type: z.literal("PASSWORD"),
  config: z
    .object({
      placeholder: z.string().optional(),
      min_length: z.number().optional(),
      show_toggle: z.boolean().optional(),
      forgot_password_link: z.string().optional(),
    })
    .optional(),
});

const paymentField = fieldComponentBase.extend({
  type: z.literal("PAYMENT"),
  config: z
    .object({
      provider: z.string().optional(),
      currency: z.string().optional(),
    })
    .optional(),
});

const socialField = fieldComponentBase.extend({
  type: z.literal("SOCIAL"),
  config: z
    .object({
      providers: z.array(z.string()).optional(),
      // Extended provider info with icons and display names
      provider_details: z
        .array(
          z.object({
            name: z.string(),
            strategy: z.string().optional(),
            display_name: z.string().optional(),
            icon_url: z.string().optional(),
          }),
        )
        .optional(),
    })
    .optional(),
});

const telField = fieldComponentBase.extend({
  type: z.literal("TEL"),
  config: z
    .object({
      placeholder: z.string().optional(),
      default_country: z.string().optional(),
    })
    .optional(),
});

const textField = fieldComponentBase.extend({
  type: z.literal("TEXT"),
  config: z
    .object({
      placeholder: z.string().optional(),
      multiline: z.boolean().optional(),
      max_length: z.number().optional(),
    })
    .optional(),
});

const urlField = fieldComponentBase.extend({
  type: z.literal("URL"),
  config: z
    .object({
      placeholder: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// Combined Component Schemas
// =============================================================================

/**
 * All BLOCK component types
 */
export const blockComponentSchema = z.discriminatedUnion("type", [
  dividerComponent,
  htmlComponent,
  imageComponent,
  jumpButtonComponent,
  resendButtonComponent,
  nextButtonComponent,
  previousButtonComponent,
  richTextComponent,
]);

/**
 * All WIDGET component types
 */
export const widgetComponentSchema = z.discriminatedUnion("type", [
  verifiableCredentialsWidget,
  gmapsAddressWidget,
  recaptchaWidget,
]);

/**
 * All FIELD component types
 */
export const fieldComponentSchema = z.discriminatedUnion("type", [
  booleanField,
  cardsField,
  choiceField,
  customField,
  dateField,
  dropdownField,
  emailField,
  fileField,
  legalField,
  numberField,
  passwordField,
  paymentField,
  socialField,
  telField,
  textField,
  urlField,
]);

/**
 * Union of all form node components
 */
export const formNodeComponentDefinition = z.union([
  blockComponentSchema,
  widgetComponentSchema,
  fieldComponentSchema,
]);

export type FormNodeComponent = z.infer<typeof formNodeComponentDefinition>;
export type BlockComponent = z.infer<typeof blockComponentSchema>;
export type WidgetComponent = z.infer<typeof widgetComponentSchema>;
export type FieldComponent = z.infer<typeof fieldComponentSchema>;

// Individual BLOCK component types
export type DividerComponent = z.infer<typeof dividerComponent>;
export type HtmlComponent = z.infer<typeof htmlComponent>;
export type ImageComponent = z.infer<typeof imageComponent>;
export type JumpButtonComponent = z.infer<typeof jumpButtonComponent>;
export type ResendButtonComponent = z.infer<typeof resendButtonComponent>;
export type NextButtonComponent = z.infer<typeof nextButtonComponent>;
export type PreviousButtonComponent = z.infer<typeof previousButtonComponent>;
export type RichTextComponent = z.infer<typeof richTextComponent>;

// Individual WIDGET component types
export type VerifiableCredentialsWidget = z.infer<
  typeof verifiableCredentialsWidget
>;
export type GmapsAddressWidget = z.infer<typeof gmapsAddressWidget>;
export type RecaptchaWidget = z.infer<typeof recaptchaWidget>;

// Individual FIELD component types
export type BooleanField = z.infer<typeof booleanField>;
export type CardsField = z.infer<typeof cardsField>;
export type ChoiceField = z.infer<typeof choiceField>;
export type CustomField = z.infer<typeof customField>;
export type DateField = z.infer<typeof dateField>;
export type DropdownField = z.infer<typeof dropdownField>;
export type EmailField = z.infer<typeof emailField>;
export type FileField = z.infer<typeof fileField>;
export type LegalField = z.infer<typeof legalField>;
export type NumberField = z.infer<typeof numberField>;
export type PasswordField = z.infer<typeof passwordField>;
export type PaymentField = z.infer<typeof paymentField>;
export type SocialField = z.infer<typeof socialField>;
export type TelField = z.infer<typeof telField>;
export type TextField = z.infer<typeof textField>;
export type UrlField = z.infer<typeof urlField>;

// =============================================================================
// Form Control (legacy, kept for compatibility)
// =============================================================================

/**
 * Schema for form controls (like submit buttons)
 * @deprecated Use NEXT_BUTTON component instead
 */
export const formControlSchema = z.object({
  id: z.string(),
  type: z.literal("submit"),
  label: z.string(),
  className: z.string().optional(),
  disabled: z.boolean().optional().default(false),
  order: z.number().optional(),
  visible: z.boolean().optional().default(true),
  customizations: z.record(z.string(), z.any()).optional(),
});

export type FormControl = z.infer<typeof formControlSchema>;

// =============================================================================
// Form Nodes (FLOW, ROUTER, STEP)
// =============================================================================

const coordinatesSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const flowNodeSchema = z.object({
  id: z.string(),
  type: z.literal("FLOW"),
  coordinates: coordinatesSchema,
  alias: z.string().min(1).max(150).optional(),
  config: z.object({
    flow_id: z.string().max(30),
    next_node: z.string().optional(),
  }),
});

const routerNodeSchema = z.object({
  id: z.string(),
  type: z.literal("ROUTER"),
  coordinates: coordinatesSchema,
  alias: z.string().min(1).max(150),
  config: z.object({
    rules: z.array(
      z.object({
        id: z.string(),
        alias: z.string().min(1).max(150).optional(),
        condition: z.any(),
        next_node: z.string(),
      }),
    ),
    fallback: z.string(),
  }),
});

const stepNodeSchema = z.object({
  id: z.string(),
  type: z.literal("STEP"),
  coordinates: coordinatesSchema,
  alias: z.string().min(1).max(150).optional(),
  config: z.object({
    components: z.array(formNodeComponentDefinition),
    next_node: z.string().optional(),
  }),
});

export const formNodeSchema = z.discriminatedUnion("type", [
  flowNodeSchema,
  routerNodeSchema,
  stepNodeSchema,
]);

export type FormNode = z.infer<typeof formNodeSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;
export type RouterNode = z.infer<typeof routerNodeSchema>;
export type StepNode = z.infer<typeof stepNodeSchema>;

// =============================================================================
// Form Schema
// =============================================================================

/**
 * Schema for forms (flow-based, matches Auth0 Forms JSON structure)
 */
export const formInsertSchema = z
  .object({
    name: z.string().openapi({
      description: "The name of the form",
    }),
    messages: z
      .object({
        errors: z.record(z.string(), z.any()).optional(),
        custom: z.record(z.string(), z.any()).optional(),
      })
      .optional(),
    languages: z
      .object({
        primary: z.string().optional(),
        default: z.string().optional(),
      })
      .optional(),
    translations: z.record(z.string(), z.any()).optional(),
    nodes: z.array(formNodeSchema).optional(),
    start: z
      .object({
        hidden_fields: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .optional(),
        next_node: z.string().optional(),
        coordinates: coordinatesSchema.optional(),
      })
      .optional(),
    ending: z
      .object({
        redirection: z
          .object({
            delay: z.number().optional(),
            target: z.string().optional(),
          })
          .optional(),
        after_submit: z.object({ flow_id: z.string().optional() }).optional(),
        coordinates: coordinatesSchema.optional(),
        resume_flow: z.boolean().optional(),
      })
      .optional(),
    style: z.object({ css: z.string().optional() }).optional(),
  })
  .openapi({
    description: "Schema for flow-based forms (matches Auth0 Forms structure)",
  });

export type FormInsert = z.input<typeof formInsertSchema>;

/**
 * Schema for complete form with base entity properties
 */
export const formSchema = z.object({
  ...baseEntitySchema.shape,
  ...formInsertSchema.shape,
  id: z.string(),
});

export type Form = z.infer<typeof formSchema>;

// =============================================================================
// Runtime Types (for widget rendering)
// =============================================================================

/**
 * Message attached to a component (validation errors, hints)
 */
export const componentMessageSchema = z.object({
  id: z.number().optional(),
  text: z.string(),
  type: z.enum(["info", "error", "success", "warning"]),
});

export type ComponentMessage = z.infer<typeof componentMessageSchema>;

/**
 * Runtime component with messages (for widget rendering)
 * Extends the base component with runtime state
 */
export type RuntimeComponent = FormNodeComponent & {
  messages?: ComponentMessage[];
};

/**
 * Navigation link displayed on the screen.
 */
export const screenLinkSchema = z.object({
  id: z.string().optional(),
  text: z.string(),
  href: z.string(),
  linkText: z.string().optional(),
});

export type ScreenLink = z.infer<typeof screenLinkSchema>;

/**
 * Screen sent to the widget (simplified STEP for rendering)
 * This is what the API returns to the widget - no flow routing logic
 */
export const uiScreenSchema = z.object({
  action: z.string(),
  method: z.enum(["POST", "GET"]),
  title: z.string().optional(),
  description: z.string().optional(),
  components: z.array(formNodeComponentDefinition),
  messages: z.array(componentMessageSchema).optional(),
  links: z.array(screenLinkSchema).optional(),
});

export type UiScreen = z.infer<typeof uiScreenSchema>;

// =============================================================================
// Type Guards
// =============================================================================

export function isBlockComponent(
  component: FormNodeComponent,
): component is BlockComponent {
  return component.category === "BLOCK";
}

export function isWidgetComponent(
  component: FormNodeComponent,
): component is WidgetComponent {
  return component.category === "WIDGET";
}

export function isFieldComponent(
  component: FormNodeComponent,
): component is FieldComponent {
  return component.category === "FIELD";
}
