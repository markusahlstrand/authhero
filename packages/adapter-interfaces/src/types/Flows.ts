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

export type Coordinates = {
  x: number;
  y: number;
};

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

// Union of all component schemas
export const componentSchema = z.union([
  richTextComponentSchema,
  buttonComponentSchema,
  legalComponentSchema,
  fieldComponentSchema,
]);

// For TypeScript types using standard interfaces
// TypeScript type for RichTextComponent
export interface RichTextComponent {
  id: string;
  category: ComponentCategory.BLOCK;
  type: ComponentType.RICH_TEXT;
  config: {
    content: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// TypeScript type for ButtonComponent
export interface ButtonComponent {
  id: string;
  category: ComponentCategory.BLOCK;
  type:
    | ComponentType.NEXT_BUTTON
    | ComponentType.BACK_BUTTON
    | ComponentType.SUBMIT_BUTTON;
  config: {
    text: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// TypeScript type for LegalComponent
export interface LegalComponent {
  id: string;
  category: ComponentCategory.FIELD;
  type: ComponentType.LEGAL;
  required?: boolean;
  sensitive?: boolean;
  config: {
    text: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// TypeScript type for FieldComponent
export interface FieldComponent {
  id: string;
  category: ComponentCategory.FIELD;
  type:
    | ComponentType.TEXT
    | ComponentType.EMAIL
    | ComponentType.PASSWORD
    | ComponentType.NUMBER
    | ComponentType.PHONE
    | ComponentType.DATE
    | ComponentType.CHECKBOX
    | ComponentType.RADIO
    | ComponentType.SELECT
    | ComponentType.HIDDEN;
  required?: boolean;
  sensitive?: boolean;
  config: {
    label?: string;
    placeholder?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Generic component type to catch any unknown component types
export interface GenericComponent {
  id: string;
  category: string;
  type: string;
  [key: string]: any;
}

// Union type for all components
export type Component =
  | RichTextComponent
  | ButtonComponent
  | LegalComponent
  | FieldComponent
  | GenericComponent;

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

// Node schema for zod
export const nodeSchema = z.union([stepNodeSchema, flowNodeSchema]);

// TypeScript interface for StepNode
export interface StepNode {
  id: string;
  type: NodeType.STEP;
  coordinates: Coordinates;
  alias?: string;
  config: {
    components: Component[];
    next_node: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// TypeScript interface for FlowNode
export interface FlowNode {
  id: string;
  type: NodeType.FLOW;
  coordinates: Coordinates;
  config: {
    flow_id: string;
    next_node: string;
    [key: string]: any;
  };
  [key: string]: any;
}

// Generic node type to catch any unknown node types
export interface GenericNode {
  id: string;
  type: string;
  coordinates: Coordinates;
  [key: string]: any;
}

// Union type for all nodes
export type Node = StepNode | FlowNode | GenericNode;

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

// TypeScript interface for Start
export interface Start {
  next_node: string;
  coordinates: Coordinates;
  [key: string]: any;
}

// TypeScript interface for Ending
export interface Ending {
  resume_flow?: boolean;
  coordinates: Coordinates;
  [key: string]: any;
}

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

// TypeScript interface for Auth0Flow
export interface Auth0Flow {
  id: string;
  name: string;
  languages: {
    primary: string;
    [key: string]: any;
  };
  nodes: Node[];
  start: Start;
  ending: Ending;
  created_at: string;
  updated_at: string;
  links: {
    sdkSrc?: string;
    sdk_src?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

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
