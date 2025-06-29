import { z } from "@hono/zod-openapi";
import { baseEntitySchema } from "./BaseEntity";

/**
 * Schema for form controls (like submit buttons)
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

/**
 * Schema for form components (fields, text, buttons, etc)
 */
export const formNodeComponentDefinition = z.discriminatedUnion("type", [
  z.object({
    id: z.string(),
    type: z.literal("RICH_TEXT"),
    config: z.object({
      content: z.string(),
    }),
    order: z.number().optional(),
    visible: z.boolean().optional().default(true),
  }),
  z.object({
    id: z.string(),
    type: z.literal("LEGAL"),
    config: z.object({
      text: z.string(),
      html: z.boolean().optional(),
    }),
    required: z.boolean().optional(),
    order: z.number().optional(),
    visible: z.boolean().optional().default(true),
  }),
  z.object({
    id: z.string(),
    type: z.literal("TEXT"),
    config: z.object({
      placeholder: z.string().optional(),
      multiline: z.boolean().optional(),
    }),
    required: z.boolean().optional(),
    sensitive: z.boolean().optional(),
    order: z.number().optional(),
    visible: z.boolean().optional().default(true),
  }),
  z.object({
    id: z.string(),
    type: z.literal("NEXT_BUTTON"),
    config: z.object({
      text: z.string().optional(),
    }),
    order: z.number().optional(),
    visible: z.boolean().optional().default(true),
  }),
  // Add more component types as needed
]);

export type FormNodeComponent = z.infer<typeof formNodeComponentDefinition>;

/**
 * Schema for forms (flow-based, matches new JSON structure)
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
    nodes: z
      .array(
        z.discriminatedUnion("type", [
          // FLOW node
          z.object({
            id: z.string(),
            type: z.literal("FLOW"),
            coordinates: z.object({ x: z.number(), y: z.number() }),
            alias: z.string().min(1).max(150).optional(),
            config: z.object({
              flow_id: z.string().max(30),
              next_node: z.string(),
            }),
          }),
          // ROUTER node
          z.object({
            id: z.string(),
            type: z.literal("ROUTER"),
            coordinates: z.object({ x: z.number(), y: z.number() }),
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
              fallback: z.array(z.string()),
            }),
          }),
          // STEP node
          z.object({
            id: z.string(),
            type: z.literal("STEP"),
            coordinates: z.object({ x: z.number(), y: z.number() }),
            alias: z.string().min(1).max(150).optional(),
            config: z.object({
              components: z.array(formNodeComponentDefinition),
              next_node: z.string(),
            }),
          }),
        ]),
      )
      .optional(),
    start: z
      .object({
        hidden_fields: z
          .array(z.object({ key: z.string(), value: z.string() }))
          .optional(),
        next_node: z.string().optional(),
        coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
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
        coordinates: z.object({ x: z.number(), y: z.number() }).optional(),
        resume_flow: z.boolean().optional(),
      })
      .optional(),
    style: z.object({ css: z.string().optional() }).optional(),
  })
  .openapi({
    description: "Schema for flow-based forms (matches new JSON structure)",
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
