import { z } from "@hono/zod-openapi";

/**
 * Types for Auth0 Form Flow components
 * Based on the actual structure used by Auth0 forms API
 */

// Coordinates used for positioning nodes in the flow editor
export const coordinatesSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// TypeScript type for Coordinates inferred from Zod schema
export type Coordinates = z.infer<typeof coordinatesSchema>;

// Component types used in forms
export enum ComponentType {
  // Block components
  RICH_TEXT = "RICH_TEXT",
  NEXT_BUTTON = "NEXT_BUTTON",
  BACK_BUTTON = "BACK_BUTTON",
  SUBMIT_BUTTON = "SUBMIT_BUTTON",
  DIVIDER = "DIVIDER",

  // Field components
  TEXT = "TEXT",
  EMAIL = "EMAIL",
  PASSWORD = "PASSWORD",
  NUMBER = "NUMBER",
  PHONE = "PHONE",
  DATE = "DATE",
  CHECKBOX = "CHECKBOX",
  RADIO = "RADIO",
  SELECT = "SELECT",
  HIDDEN = "HIDDEN",
  LEGAL = "LEGAL",
}

// Component categories
export enum ComponentCategory {
  BLOCK = "BLOCK",
  FIELD = "FIELD",
}

// Base component schema with common properties
const baseComponentSchema = z.object({
  id: z.string(),
  category: z.nativeEnum(ComponentCategory),
  type: z.nativeEnum(ComponentType),
});

// For zod schemas using passthrough
// Rich text component schema
export const richTextComponentSchema = baseComponentSchema.extend({
  category: z.literal(ComponentCategory.BLOCK),
  type: z.literal(ComponentType.RICH_TEXT),
  config: z
    .object({
      content: z.string(),
    })
    .passthrough(),
});

// Button component schema
export const buttonComponentSchema = baseComponentSchema.extend({
  category: z.literal(ComponentCategory.BLOCK),
  type: z.union([
    z.literal(ComponentType.NEXT_BUTTON),
    z.literal(ComponentType.BACK_BUTTON),
    z.literal(ComponentType.SUBMIT_BUTTON),
  ]),
  config: z
    .object({
      text: z.string(),
    })
    .passthrough(),
});

// Legal component schema
export const legalComponentSchema = baseComponentSchema.extend({
  category: z.literal(ComponentCategory.FIELD),
  type: z.literal(ComponentType.LEGAL),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  config: z
    .object({
      text: z.string(),
    })
    .passthrough(),
});

// Field component schema
export const fieldComponentSchema = baseComponentSchema.extend({
  category: z.literal(ComponentCategory.FIELD),
  type: z.union([
    z.literal(ComponentType.TEXT),
    z.literal(ComponentType.EMAIL),
    z.literal(ComponentType.PASSWORD),
    z.literal(ComponentType.NUMBER),
    z.literal(ComponentType.PHONE),
    z.literal(ComponentType.DATE),
    z.literal(ComponentType.CHECKBOX),
    z.literal(ComponentType.RADIO),
    z.literal(ComponentType.SELECT),
    z.literal(ComponentType.HIDDEN),
  ]),
  required: z.boolean().optional(),
  sensitive: z.boolean().optional(),
  config: z
    .object({
      label: z.string().optional(),
      placeholder: z.string().optional(),
    })
    .passthrough(),
});

// Generic component schema
export const genericComponentSchema = z
  .object({
    id: z.string(),
    category: z.string(),
    type: z.string(),
  })
  .passthrough();

// Union of all component schemas
export const componentSchema = z.union([
  richTextComponentSchema,
  buttonComponentSchema,
  legalComponentSchema,
  fieldComponentSchema,
  genericComponentSchema,
]);

// TypeScript types using Zod inference
// TypeScript type for RichTextComponent inferred from Zod schema
export type RichTextComponent = z.infer<typeof richTextComponentSchema>;

// TypeScript type for ButtonComponent inferred from Zod schema
export type ButtonComponent = z.infer<typeof buttonComponentSchema>;

// TypeScript type for LegalComponent inferred from Zod schema
export type LegalComponent = z.infer<typeof legalComponentSchema>;

// TypeScript type for FieldComponent inferred from Zod schema
export type FieldComponent = z.infer<typeof fieldComponentSchema>;

// TypeScript type for GenericComponent inferred from Zod schema
export type GenericComponent = z.infer<typeof genericComponentSchema>;

// Union type for all components inferred from component schema
export type Component = z.infer<typeof componentSchema>;

// Node types in the flow
export enum NodeType {
  STEP = "STEP",
  FLOW = "FLOW",
  CONDITION = "CONDITION",
  ACTION = "ACTION",
}

// Step node schema for zod
export const stepNodeSchema = z.object({
  id: z.string(),
  type: z.literal(NodeType.STEP),
  coordinates: coordinatesSchema,
  alias: z.string().optional(),
  config: z
    .object({
      components: z.array(componentSchema),
      next_node: z.string(),
    })
    .passthrough(),
});

// Flow node schema for zod
export const flowNodeSchema = z.object({
  id: z.string(),
  type: z.literal(NodeType.FLOW),
  coordinates: coordinatesSchema,
  config: z.object({
    flow_id: z.string(),
    next_node: z.string(),
  }),
});

// Generic node schema for zod
export const genericNodeSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    coordinates: coordinatesSchema,
  })
  .passthrough();

// Node schema for zod
export const nodeSchema = z.union([
  stepNodeSchema,
  flowNodeSchema,
  genericNodeSchema,
]);

// TypeScript type for StepNode inferred from Zod schema
export type StepNode = z.infer<typeof stepNodeSchema>;

// TypeScript type for FlowNode inferred from Zod schema
export type FlowNode = z.infer<typeof flowNodeSchema>;

// TypeScript type for GenericNode inferred from Zod schema
export type GenericNode = z.infer<typeof genericNodeSchema>;

// Union type for all nodes inferred from nodeSchema
export type Node = z.infer<typeof nodeSchema>;

// Start node schema for zod
export const startSchema = z
  .object({
    next_node: z.string(),
    coordinates: coordinatesSchema,
  })
  .passthrough();

// Ending node schema for zod
export const endingSchema = z
  .object({
    resume_flow: z.boolean().optional(),
    coordinates: coordinatesSchema,
  })
  .passthrough();

// TypeScript type for Start inferred from Zod schema
export type Start = z.infer<typeof startSchema>;

// TypeScript type for Ending inferred from Zod schema
export type Ending = z.infer<typeof endingSchema>;

// Auth0 flow schema for zod
export const auth0FlowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    languages: z
      .object({
        primary: z.string(),
      })
      .passthrough(),
    nodes: z.array(nodeSchema),
    start: startSchema,
    ending: endingSchema,
    created_at: z.string(),
    updated_at: z.string(),
    links: z
      .object({
        sdkSrc: z.string().optional(),
        sdk_src: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

// TypeScript type for Auth0Flow inferred from Zod schema
export type Auth0Flow = z.infer<typeof auth0FlowSchema>;

// Schema for creating or updating a flow
export const auth0FlowInsertSchema = auth0FlowSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
});

// TypeScript interface for Auth0FlowInsert
export interface Auth0FlowInsert {
  name: string;
  languages: {
    primary: string;
    [key: string]: any;
  };
  nodes: Node[];
  start: Start;
  ending: Ending;
  links?: {
    sdkSrc?: string;
    sdk_src?: string;
    [key: string]: any;
  };
  [key: string]: any;
}
